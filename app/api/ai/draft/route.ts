import { NextResponse } from "next/server";

import { draftInternship } from "@/lib/evaluate";
import { asNumber, parseList } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/draft
 *
 * body: { title, company, type, location, workMode, level, durationMonths, skills, notes }
 *
 * Asks the free Pollinations LLM to write the description, responsibilities,
 * requirements, tags and skills for a vacancy. Falls back to a local template
 * when the model is unreachable.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "`title` is required to draft a vacancy." }, { status: 400 });
  }

  try {
    const draft = await draftInternship({
      title,
      company: String(body.company ?? "").trim(),
      type: String(body.type ?? "").trim(),
      location: String(body.location ?? "").trim(),
      workMode: String(body.workMode ?? "hybrid").trim(),
      level: String(body.level ?? "any").trim(),
      durationMonths: Math.round(asNumber(body.durationMonths, 3)),
      skills: parseList(body.skills as string | string[]),
      notes: String(body.notes ?? "").trim(),
    });
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "The AI draft failed.", detail: message },
      { status: 502 },
    );
  }
}
