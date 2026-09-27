import { NextResponse } from "next/server";

import { normalizeTaxonomies } from "@/lib/schema";
import { mutateDb, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/taxonomies - the editable dropdown options (types, locations, ...). */
export async function GET() {
  const db = await readDb();
  return NextResponse.json({ taxonomies: db.taxonomies });
}

/** PUT /api/taxonomies - replace the editable option lists. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const taxonomies = await mutateDb((db) => {
    db.taxonomies = normalizeTaxonomies(body, db.taxonomies);
    return db.taxonomies;
  });

  return NextResponse.json({ taxonomies });
}
