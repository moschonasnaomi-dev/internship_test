import { NextResponse } from "next/server";

import { normalizeCandidate } from "@/lib/schema";
import { mutateDb, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/candidates - saved candidate profiles used by the recruiter view. */
export async function GET() {
  const db = await readDb();
  return NextResponse.json({ candidates: db.candidates });
}

/** POST /api/candidates - create a candidate profile. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const candidate = await mutateDb((db) => {
    const created = normalizeCandidate(body);
    db.candidates = [created, ...db.candidates];
    return created;
  });

  return NextResponse.json({ candidate }, { status: 201 });
}
