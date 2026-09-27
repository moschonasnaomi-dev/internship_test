import { NextResponse } from "next/server";

import { getStorageInfo, importDb, readDb, resetDb } from "@/lib/store";
import type { DatabaseShape } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/db - download the whole database (backup / migrate). */
export async function GET() {
  const db = await readDb();
  return new NextResponse(JSON.stringify(db, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="internship-compass-db.json"',
    },
  });
}

/** POST /api/db?mode=merge|replace - import a previously exported database. */
export async function POST(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") === "replace" ? "replace" : "merge";
  const body = (await request.json().catch(() => null)) as Partial<DatabaseShape> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const summary = await importDb(body, mode);
  return NextResponse.json({ ok: true, mode, summary, storage: getStorageInfo() });
}

/** DELETE /api/db - restore the bundled seed data. */
export async function DELETE() {
  await resetDb();
  const db = await readDb({ fresh: true });
  return NextResponse.json({
    ok: true,
    storage: getStorageInfo(),
    counts: { internships: db.internships.length, candidates: db.candidates.length },
  });
}
