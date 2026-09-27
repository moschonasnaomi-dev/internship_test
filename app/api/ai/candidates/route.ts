import { NextResponse } from "next/server";

import { rankCandidatesForInternship } from "@/lib/evaluate";
import { normalizeCandidate } from "@/lib/schema";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CANDIDATES = 20;

/**
 * POST /api/ai/candidates
 *
 * body: {
 *   internshipId: string,             // required
 *   candidateIds?: string[],          // default: all stored candidates
 *   candidates?: CandidateInput[],    // or ad-hoc profiles typed in the browser
 * }
 *
 * Ranks every candidate against one internship and adds three tailored
 * interview questions per candidate.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const internshipId = String(body.internshipId ?? "");
  if (!internshipId) {
    return NextResponse.json({ error: "`internshipId` is required." }, { status: 400 });
  }

  const db = await readDb();
  const internship = db.internships.find((item) => item.id === internshipId);
  if (!internship) {
    return NextResponse.json({ error: `Internship ${internshipId} not found.` }, { status: 404 });
  }

  const adHoc = Array.isArray(body.candidates)
    ? body.candidates.filter((item) => item && typeof item === "object").map((item) => normalizeCandidate(item))
    : [];
  const knownIds = Array.isArray(body.candidateIds) ? body.candidateIds.map((id) => String(id)) : [];

  const fromStore = knownIds.length
    ? db.candidates.filter((candidate) => knownIds.includes(candidate.id))
    : db.candidates;

  const candidates = [...adHoc, ...fromStore].slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No candidates available to rank. Save a profile first." },
      { status: 404 },
    );
  }

  try {
    const { results, meta } = await rankCandidatesForInternship(internship, candidates);
    return NextResponse.json({
      mode: "internship-to-candidates",
      internship: {
        id: internship.id,
        title: internship.title,
        company: internship.company,
      },
      results,
      meta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "The AI ranking failed.", detail: message },
      { status: 502 },
    );
  }
}
