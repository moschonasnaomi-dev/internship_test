import type { Internship, Verdict } from "./types";

/** Small, dependency-free helpers shared by client and server code. */

export function uid(prefix = "it"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = norm(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Case-insensitive, whitespace tolerant list parsing: "a, b; c" -> ["a","b","c"]. */
export function parseList(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) return uniq(value);
  if (!value) return [];
  return uniq(value.split(/[\n,;|]/g));
}

/** Deterministic 32-bit hash, handy for stable random seeds. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2147483647;
}

export function verdictFromScore(score: number): Verdict {
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 45) return "possible";
  return "weak";
}

export function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "strong":
      return "Strong match";
    case "good":
      return "Good match";
    case "possible":
      return "Possible match";
    default:
      return "Weak match";
  }
}

export function verdictClasses(verdict: Verdict): string {
  switch (verdict) {
    case "strong":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "good":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "possible":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    default:
      return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/**
 * Pull the first JSON object out of a model answer. Small models sometimes wrap
 * JSON in prose or code fences even when asked not to.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "```")
    .trim();

  const fenced = cleaned.split("```");
  const candidates: string[] = [];
  if (fenced.length > 1) candidates.push(fenced[1]);
  candidates.push(cleaned);

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniq(value.map((item) => String(item ?? "")).filter(Boolean));
  }
  if (typeof value === "string") return parseList(value);
  return [];
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Compact, token-cheap projection of an internship for LLM prompts. */
export function labelFrom(
  terms: { value: string; label: string }[],
  value: string,
): string {
  const found = terms.find(
    (term) => term.value.toLowerCase() === String(value ?? "").toLowerCase(),
  );
  return found?.label ?? value;
}

export function internshipForPrompt(internship: Internship) {
  return {
    id: internship.id,
    title: internship.title,
    company: internship.company,
    type: internship.type,
    location: internship.location,
    country: internship.country,
    workMode: internship.workMode,
    level: internship.level,
    durationMonths: internship.durationMonths,
    hoursPerWeek: internship.hoursPerWeek,
    stipendEurPerMonth: internship.stipendEurPerMonth,
    startDate: internship.startDate,
    languages: internship.languages,
    skills: internship.skills.slice(0, 12),
    tags: internship.tags.slice(0, 8),
    requirements: internship.requirements.slice(0, 6),
    description: internship.description.slice(0, 700),
    status: internship.status,
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
