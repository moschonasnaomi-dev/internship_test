import { NextResponse } from "next/server";

import { evaluateInternshipsForCandidate } from "@/lib/evaluate";
import { checkPollinations } from "@/lib/pollinations";
import { normalizeCandidate } from "@/lib/schema";
import { getStorageInfo, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TARGETS = 20;

/**
 * POST /api/ai/match
 *
 * body: {
 *   candidate?: CandidateProfileInput,   // a draft profile typed in the browser
 *   candidateId?: string,                // or a stored profile
 *   internshipIds?: string[],            // default: every open internship
 *   includeClosed?: boolean
 * }
 *
 * Returns the AI score, verdict and reasoning for each internship, sorted best
 * first, plus run metadata (model, endpoint, batching, timing).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });
  }

  const db = await readDb();
  const candidate =
    body.candidate && typeof body.candidate === "object"
      ? normalizeCandidate(body.candidate)
      : db.candidates.find((item) => item.id === String(body.candidateId ?? ""));

  if (!candidate) {
    return NextResponse.json(
      { error: "Provide a `candidate` object or a known `candidateId`." },
      { status: 400 },
    );
  }

  const requestedIds = Array.isArray(body.internshipIds)
    ? body.internshipIds.map((id) => String(id))
    : [];
  const includeClosed = body.includeClosed === true;

  let internships = db.internships.filter(
    (internship) => includeClosed || internship.status !== "closed",
  );
  if (requestedIds.length > 0) {
    internships = internships.filter((internship) => requestedIds.includes(internship.id));
  }
  internships = internships.slice(0, MAX_TARGETS);

  if (internships.length === 0) {
    return NextResponse.json(
      { error: "No internships matched the request." },
      { status: 404 },
    );
  }

  try {
    const { results, meta } = await evaluateInternshipsForCandidate(candidate, internships);
    return NextResponse.json({
      mode: "candidate-to-internships",
      candidate: { id: candidate.id, name: candidate.name },
      results,
      meta,
      storage: getStorageInfo(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "The AI evaluation failed.", detail: message },
      { status: 502 },
    );
  }
}

/** GET /api/ai/match - connectivity probe for the Pollinations LLM. */
export async function GET() {
  const health = await checkPollinations();
  return NextResponse.json({ health, storage: getStorageInfo() }, { status: health.ok ? 200 : 503 });
}
