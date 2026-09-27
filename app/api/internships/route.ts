import { NextResponse } from "next/server";

import { normalizeInternship } from "@/lib/schema";
import { mutateDb, readDb } from "@/lib/store";
import type { Internship } from "@/lib/types";

export const dynamic = "force-dynamic";

function matches(internship: Internship, params: URLSearchParams): boolean {
  const q = params.get("q")?.trim().toLowerCase();
  const type = params.get("type")?.trim().toLowerCase();
  const location = params.get("location")?.trim().toLowerCase();
  const status = params.get("status")?.trim().toLowerCase();
  const workMode = params.get("workMode")?.trim().toLowerCase();
  const skill = params.get("skill")?.trim().toLowerCase();

  if (type && internship.type.toLowerCase() !== type) return false;
  if (location && internship.location.toLowerCase() !== location) return false;
  if (status && internship.status.toLowerCase() !== status) return false;
  if (workMode && internship.workMode.toLowerCase() !== workMode) return false;
  if (skill && !internship.skills.some((item) => item.toLowerCase() === skill)) {
    return false;
  }
  if (q) {
    const haystack = [
      internship.title,
      internship.company,
      internship.description,
      internship.location,
      internship.type,
      internship.tags.join(" "),
      internship.skills.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/** GET /api/internships?q=&type=&location=&status=&workMode=&skill= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const db = await readDb();
  const internships = db.internships
    .filter((internship) => matches(internship, params))
    .sort((a, b) => a.title.localeCompare(b.title));

  return NextResponse.json({
    internships,
    total: db.internships.length,
    filtered: internships.length,
    taxonomies: db.taxonomies,
  });
}

/** POST /api/internships - create one internship. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const internship = await mutateDb((db) => {
    const created = normalizeInternship(body);
    db.internships = [created, ...db.internships];
    return created;
  });

  return NextResponse.json({ internship }, { status: 201 });
}
