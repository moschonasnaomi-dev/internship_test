import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { reconcileTaxonomies, SCHEMA_VERSION, seedDatabase } from "./seed";
import type { DatabaseShape } from "./types";

/**
 * Persistence layer.
 *
 * Three interchangeable modes, resolved at runtime:
 *
 *  1. `kv`   - Upstash Redis / Vercel KV REST API. Durable on Vercel.
 *              Enabled automatically when the marketplace integration injects
 *              KV_REST_API_URL + KV_REST_API_TOKEN (or the UPSTASH_* names).
 *  2. `file` - a JSON file on disk. Used for local development so edits survive
 *              a restart, and on Vercel (in /tmp) when no KV is configured.
 *  3. `memory` - last-resort fallback if the file cannot be written.
 *
 * Whichever mode is active, the API always reports it honestly via
 * `getStorageInfo()` so the UI can warn when edits are short-lived.
 */

const KV_KEY = process.env.VIBE_DB_KEY || "internship-compass:db:v1";
const CACHE_TTL_MS = 1500;

export type StorageMode = "kv" | "file" | "memory";

export interface StorageInfo {
  mode: StorageMode;
  durable: boolean;
  location: string;
  note: string;
}

interface KvConfig {
  url: string;
  token: string;
}

function kvConfig(): KvConfig | null {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";
  if (url && token) return { url: url.replace(/\/+$/, ""), token };
  return null;
}

function filePath(): string {
  if (process.env.VIBE_DB_FILE) return process.env.VIBE_DB_FILE;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "internship-compass-db.json");
  return path.join(process.cwd(), "data", "db.local.json");
}

export function getStorageInfo(): StorageInfo {
  const kv = kvConfig();
  if (kv) {
    return {
      mode: "kv",
      durable: true,
      location: new URL(kv.url).host,
      note: "Connected to the Upstash/Vercel KV store: edits are permanent.",
    };
  }
  if (process.env.VERCEL) {
    return {
      mode: "file",
      durable: false,
      location: "/tmp (ephemeral on Vercel)",
      note: "No KV store configured. Edits live in /tmp and can disappear on a cold start or a new deployment. Add the Upstash Redis integration for permanent storage.",
    };
  }
  return {
    mode: "file",
    durable: true,
    location: filePath(),
    note: "Writing to a local JSON file: edits survive restarts on this machine.",
  };
}

// --- module state -----------------------------------------------------------
// Cached copy of the database, a serialised write chain and an in-memory
// fallback used when no writable backend is available.
let cache: { at: number; db: DatabaseShape } | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
let memoryDb: DatabaseShape | null = null;

async function writeRaw(db: DatabaseShape): Promise<StorageMode> {
  const payload = JSON.stringify(db);
  const kv = kvConfig();
  if (kv) {
    try {
      await kvCommand(["SET", KV_KEY, payload]);
      return "kv";
    } catch (error) {
      console.error("[store] KV write failed, keeping edits in memory", error);
      memoryDb = db;
      return "memory";
    }
  }
  try {
    const target = filePath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, payload, "utf8");
    return "file";
  } catch (error) {
    console.error("[store] file write failed, keeping edits in memory", error);
    memoryDb = db;
    return "memory";
  }
}

function normalize(db: DatabaseShape): DatabaseShape {
  return {
    version: db.version || SCHEMA_VERSION,
    updatedAt: db.updatedAt || new Date().toISOString(),
    internships: Array.isArray(db.internships) ? db.internships : [],
    candidates: Array.isArray(db.candidates) ? db.candidates : [],
    taxonomies: db.taxonomies,
  };
}

export async function readDb(options?: { fresh?: boolean }): Promise<DatabaseShape> {
  if (!options?.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.db;
  }
  let db = memoryDb ?? (await readRaw());
  if (!db) {
    db = seedDatabase();
    await writeRaw(db);
  }
  db = normalize(db);
  db.taxonomies = reconcileTaxonomies(db);
  cache = { at: Date.now(), db };
  return db;
}

/**
 * Serialised read-modify-write. Concurrent requests are chained so two edits
 * arriving at the same time cannot overwrite each other inside one instance.
 */
export async function mutateDb<T>(
  mutator: (db: DatabaseShape) => T | Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await readDb({ fresh: true });
    const result = await mutator(db);
    db.updatedAt = new Date().toISOString();
    db.version = (db.version || SCHEMA_VERSION) + 1;
    db.taxonomies = reconcileTaxonomies(db);
    const mode = await writeRaw(db);
    memoryDb = mode === "memory" ? db : null;
    cache = { at: Date.now(), db };
    return result;
  };

  const queued = writeChain.then(run, run);
  // Keep the chain alive even if a mutation throws.
  writeChain = queued.catch(() => undefined);
  return queued;
}

/** Wipe runtime state and restore the bundled seed data. */
export async function resetDb(): Promise<DatabaseShape> {
  return mutateDb((db) => {
    const fresh = seedDatabase();
    db.internships = fresh.internships;
    db.candidates = fresh.candidates;
    db.taxonomies = fresh.taxonomies;
    return fresh;
  });
}

/** Replace or merge the whole database (used by the import endpoint). */
export async function importDb(
  incoming: Partial<DatabaseShape>,
  mode: "merge" | "replace",
): Promise<{ internships: number; candidates: number }> {
  return mutateDb((db) => {
    if (mode === "replace") {
      db.internships = incoming.internships ?? db.internships;
      db.candidates = incoming.candidates ?? db.candidates;
    } else {
      const byId = new Map(db.internships.map((item) => [item.id, item]));
      for (const item of incoming.internships ?? []) byId.set(item.id, item);
      db.internships = [...byId.values()];

      const candidateById = new Map(db.candidates.map((item) => [item.id, item]));
      for (const item of incoming.candidates ?? []) {
        candidateById.set(item.id, item);
      }
      db.candidates = [...candidateById.values()];
    }
    if (incoming.taxonomies) db.taxonomies = incoming.taxonomies;
    return {
      internships: db.internships.length,
      candidates: db.candidates.length,
    };
  });
}

async function kvCommand<T = unknown>(command: (string | number)[]): Promise<T> {
  const kv = kvConfig();
  if (!kv) throw new Error("KV is not configured");
  const response = await fetch(kv.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`KV ${command[0]} failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(`KV error: ${payload.error}`);
  return payload.result as T;
}

async function readRaw(): Promise<DatabaseShape | null> {
  const kv = kvConfig();
  if (kv) {
    try {
      const raw = await kvCommand<string | null>(["GET", KV_KEY]);
      if (!raw) return null;
      return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as DatabaseShape;
    } catch (error) {
      console.error("[store] KV read failed, falling back to local state", error);
    }
  }
  try {
    // turbopackIgnore: true stops Turbopack from tracing the whole project into
    // the server bundle because the path is resolved at runtime.
    const raw = await fs.readFile(/* turbopackIgnore: true */ filePath(), "utf8");
    return JSON.parse(raw) as DatabaseShape;
  } catch {
    return null;
  }
}
