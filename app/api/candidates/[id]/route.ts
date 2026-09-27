import { NextResponse } from "next/server";

import { normalizeCandidate } from "@/lib/schema";
import { mutateDb } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** PUT / PATCH /api/candidates/:id */
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const candidate = await mutateDb((db) => {
    const index = db.candidates.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated = normalizeCandidate(
      { ...db.candidates[index], ...(body as Record<string, unknown>) },
      db.candidates[index],
    );
    db.candidates[index] = updated;
    return updated;
  });

  if (!candidate) {
    return NextResponse.json({ error: `Candidate ${id} not found.` }, { status: 404 });
  }
  return NextResponse.json({ candidate });
}

export const PATCH = PUT;

/** DELETE /api/candidates/:id */
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const removed = await mutateDb((db) => {
    const before = db.candidates.length;
    db.candidates = db.candidates.filter((item) => item.id !== id);
    return before !== db.candidates.length;
  });

  if (!removed) {
    return NextResponse.json({ error: `Candidate ${id} not found.` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: id });
}
