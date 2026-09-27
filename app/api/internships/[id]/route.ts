import { NextResponse } from "next/server";

import { normalizeInternship } from "@/lib/schema";
import { mutateDb } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** PUT / PATCH /api/internships/:id - edit an internship (full or partial). */
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const result = await mutateDb((db) => {
    const index = db.internships.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated = normalizeInternship(
      { ...db.internships[index], ...(body as Record<string, unknown>) },
      db.internships[index],
    );
    db.internships[index] = updated;
    return updated;
  });

  if (!result) {
    return NextResponse.json({ error: `Internship ${id} not found.` }, { status: 404 });
  }
  return NextResponse.json({ internship: result });
}

export const PATCH = PUT;

/** DELETE /api/internships/:id */
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const removed = await mutateDb((db) => {
    const before = db.internships.length;
    db.internships = db.internships.filter((item) => item.id !== id);
    return before !== db.internships.length;
  });

  if (!removed) {
    return NextResponse.json({ error: `Internship ${id} not found.` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: id });
}
