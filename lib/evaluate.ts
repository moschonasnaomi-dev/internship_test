import { overlapSignal } from "./overlap";
import { chatJson, pollinationsConfig } from "./pollinations";
import type {
  AiRunMeta,
  CandidateProfile,
  Internship,
  MatchResult,
  OverlapSignal,
  Verdict,
} from "./types";
import {
  asNumber,
  chunk,
  clamp,
  hashString,
  norm,
  sleep,
  toArray,
  verdictFromScore,
} from "./utils";

/**
 * Evaluation engine.
 *
 * Two directions are supported:
 *  - a candidate against many internships (`evaluateInternshipsForCandidate`)
 *  - many candidates against one internship (`rankCandidatesForInternship`)
 *
 * Both send a compact JSON payload to the free Pollinations LLM and ask for
 * strict JSON back. A deterministic local overlap check is computed first: it is
 * handed to the model as extra signal and also used as a transparent fallback if
 * the model is unavailable, so the app never returns nothing.
 */

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 350;

const MATCH_SYSTEM_PROMPT = `You are Internship Compass, an evidence-based internship matching engine for students in Flanders and the Netherlands.
Score how well the candidate fits EACH internship using this rubric (100 points total):
- 40 points: skill and domain overlap between the candidate's skills/experience and the internship's skills, requirements and description.
- 15 points: type fit (candidate preferredTypes vs the internship type, e.g. devshop, corporate, government, research).
- 15 points: location and work-mode fit (preferredLocations and preferredWorkModes; treat remote as flexible).
- 15 points: seniority fit (candidate education and experienceYears vs the internship level and requirements).
- 15 points: practical fit (hoursPerWeek, availabilityMonths, shared languages).
Hard rules:
- Use ONLY the facts in the payload. Never invent skills, employers, dates or benefits.
- Output raw JSON only. No markdown, no code fences, no commentary.
- Integer scores 0-100. Be discriminating: 90+ needs near-perfect overlap, below 40 means a real mismatch.
- Write matched/gaps entries as short strings (max 6 words each), 0 to 5 items each.
- rationale: max 45 words, state the decisive factor and the single biggest gap.
- verdict must follow the score: strong >= 80, good 65-79, possible 45-64, weak below 45.
- Return exactly one entry per given internshipId and nothing else.
Required JSON shape: {"results":[{"internshipId":"<id>","score":0,"verdict":"strong|good|possible|weak","matched":["..."],"gaps":["..."],"rationale":"..."}]}`;

const CANDIDATE_SYSTEM_PROMPT = `You are Internship Compass, a recruiting assistant that ranks internship applicants for ONE vacancy.
For every candidate, score the fit using this rubric (100 points total):
- 45 points: skills and demonstrated experience vs the internship skills, requirements and description.
- 20 points: seniority and education fit for the internship level.
- 15 points: practical fit (availabilityMonths, hoursPerWeek, languages required by the internship).
- 10 points: location and work-mode feasibility.
- 10 points: motivation signals and portfolio in the candidate notes/summary.
Hard rules:
- Use ONLY the facts in the payload. Never invent anything about a candidate.
- Output raw JSON only. No markdown, no code fences, no commentary.
- Integer scores 0-100. verdict must follow the score: strong >= 80, good 65-79, possible 45-64, weak below 45.
- strengths/gaps: short strings (max 6 words), 0 to 5 items each.
- rationale: max 45 words, aimed at the recruiter, mention the decisive factor.
- interviewQuestions: exactly 3 short, specific questions to probe the candidate's weakest area.
- Return exactly one entry per given candidateId and nothing else. The results array MUST contain every candidateId from the payload — never skip or merge candidates.
Required JSON shape: {"results":[{"candidateId":"<id>","score":0,"verdict":"strong|good|possible|weak","strengths":["..."],"gaps":["..."],"rationale":"...","interviewQuestions":["...","...","..."]}]}`;

export const DRAFT_SYSTEM_PROMPT = `You write internship vacancy texts for Belgian companies. You are concrete, honest and never use buzzwords like "rockstar" or "family".
Output raw JSON only, no markdown. Required shape:
{"description":"3-4 sentence paragraph","responsibilities":["4 concise bullets"],"requirements":["4 concise bullets"],"tags":["4 short tags"],"skills":["up to 6 skills"]}
Write in English, keep every bullet under 15 words, and stay plausible for the given company type and location. Never invent salary figures.`;

// The deterministic overlap scorer lives in ./overlap so it can also be used
// from client components without pulling in the network client.
export { overlapSignal };

// --- model output parsing ---------------------------------------------------

interface RawEntry {
  internshipId?: unknown;
  candidateId?: unknown;
  score?: unknown;
  verdict?: unknown;
  matched?: unknown;
  strengths?: unknown;
  gaps?: unknown;
  rationale?: unknown;
  interviewQuestions?: unknown;
}

function fallbackEnabled(): boolean {
  return process.env.ALLOW_HEURISTIC_FALLBACK !== "false";
}

function normalizeVerdict(raw: unknown, score: number): Verdict {
  const value = norm(String(raw ?? ""));
  if (value === "strong" || value === "good" || value === "possible" || value === "weak") {
    return value as Verdict;
  }
  return verdictFromScore(score);
}

function heuristicInternshipResult(
  internship: Internship,
  signal: OverlapSignal,
): MatchResult {
  const score = clamp(signal.overlapScore, 0, 100);
  return {
    targetId: internship.id,
    targetLabel: internship.title,
    secondaryLabel: `${internship.company} · ${internship.type}`,
    score,
    verdict: verdictFromScore(score),
    matched: signal.matched,
    gaps: signal.gaps,
    rationale: `Local overlap check (no model call): ${signal.breakdown
      .map((item) => `${item.label} ${item.points}/${item.max}`)
      .join(", ")}.`,
    interviewQuestions: [],
    source: "heuristic",
    model: "local-overlap-scorer",
  };
}

function heuristicCandidateResult(
  internship: Internship,
  candidate: CandidateProfile,
  signal: OverlapSignal,
): MatchResult {
  const score = clamp(signal.overlapScore, 0, 100);
  return {
    targetId: candidate.id,
    targetLabel: candidate.name,
    secondaryLabel: candidate.headline,
    score,
    verdict: verdictFromScore(score),
    matched: signal.matched,
    gaps: signal.gaps,
    rationale: `Local overlap check for "${internship.title}": ${signal.breakdown
      .map((item) => `${item.label} ${item.points}/${item.max}`)
      .join(", ")}.`,
    interviewQuestions: [
      `Walk me through a project where you used ${internship.skills[0] ?? "your main skill"}.`,
      `How would you close the gap around ${
        signal.gaps.find((gap) => gap !== "No mechanical blocker detected") ??
        "any remaining requirement"
      }?`,
      `What would you want to learn in your first month at ${internship.company}?`,
    ],
    source: "heuristic",
    model: "local-overlap-scorer",
  };
}

function emptyMeta(notes: string[]): AiRunMeta {
  const config = pollinationsConfig();
  return {
    model: config.model,
    endpoint: config.endpoint,
    auth: config.auth,
    batches: 0,
    llmScored: 0,
    fallbackScored: 0,
    durationMs: 0,
    notes,
  };
}

function candidatePayload(candidate: CandidateProfile) {
  return {
    id: candidate.id,
    name: candidate.name,
    headline: candidate.headline,
    education: candidate.education,
    experienceYears: candidate.experienceYears,
    experienceSummary: candidate.experienceSummary,
    skills: candidate.skills,
    languages: candidate.languages,
    preferredTypes: candidate.preferredTypes,
    preferredLocations: candidate.preferredLocations,
    preferredWorkModes: candidate.preferredWorkModes,
    availabilityMonths: candidate.availabilityMonths,
    hoursPerWeek: candidate.hoursPerWeek,
    portfolioUrl: candidate.portfolioUrl,
    notes: candidate.notes,
  };
}

function internshipPayload(internship: Internship) {
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
    skills: internship.skills,
    tags: internship.tags,
    requirements: internship.requirements,
    description: internship.description.slice(0, 500),
    status: internship.status,
  };
}

/**
 * Score one candidate against many internships.
 * Internships are evaluated in small batches so a single failure only costs one
 * batch, and the deterministic scorer transparently covers any missing result.
 */
export async function evaluateInternshipsForCandidate(
  candidate: CandidateProfile,
  internships: Internship[],
): Promise<{ results: MatchResult[]; meta: AiRunMeta }> {
  const started = Date.now();
  const notes: string[] = [];
  const signals = new Map<string, OverlapSignal>();
  for (const internship of internships) {
    signals.set(internship.id, overlapSignal(candidate, internship));
  }

  const byId = new Map(internships.map((item) => [item.id, item]));
  const llmResults = new Map<string, MatchResult>();
  const batches = chunk(internships, BATCH_SIZE);
  let model = pollinationsConfig().model;
  let batchCount = 0;

  for (const [index, batch] of batches.entries()) {
    batchCount += 1;
    const seed = hashString(
      `match:${candidate.id}:${batch.map((item) => item.id).join(",")}`,
    );
    const user = JSON.stringify({
      task: "score_candidate_against_internships",
      candidate: candidatePayload(candidate),
      internships: batch.map(internshipPayload),
      mechanicalOverlapHint: batch.map((internship) => {
        const signal = signals.get(internship.id);
        return {
          internshipId: internship.id,
          localOverlapScore: signal?.overlapScore ?? 0,
          locallyMatchedSkills: signal?.matched ?? [],
          locallyMissing: signal?.gaps ?? [],
        };
      }),
    });

    try {
      const response = await chatJson<{ results?: RawEntry[] }>({
        system: MATCH_SYSTEM_PROMPT,
        user,
        seed,
        maxTokens: 1500,
      });
      model = response.model;
      const entries = Array.isArray(response.data?.results) ? response.data.results : [];
      for (const entry of entries) {
        const id = String(entry.internshipId ?? "");
        const internship = byId.get(id);
        if (!internship) continue;
        const score = clamp(Math.round(asNumber(entry.score, 0)), 0, 100);
        llmResults.set(id, {
          targetId: id,
          targetLabel: internship.title,
          secondaryLabel: `${internship.company} · ${internship.type}`,
          score,
          verdict: normalizeVerdict(entry.verdict, score),
          matched: toArray(entry.matched ?? entry.strengths).slice(0, 5),
          gaps: toArray(entry.gaps).slice(0, 5),
          rationale: String(entry.rationale ?? "").trim() || "No rationale returned.",
          interviewQuestions: toArray(entry.interviewQuestions).slice(0, 3),
          source: "llm",
          model: response.model,
        });
      }
      if (entries.length === 0) {
        notes.push(`Batch ${index + 1}: the model returned no usable rows.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`Batch ${index + 1} failed: ${message}`);
      if (!fallbackEnabled()) throw error;
    }

    if (index < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  const results = internships.map((internship) => {
    const fromLlm = llmResults.get(internship.id);
    if (fromLlm) return fromLlm;
    const signal = signals.get(internship.id) as OverlapSignal;
    return heuristicInternshipResult(internship, signal);
  });

  return {
    results: results.sort((a, b) => b.score - a.score),
    meta: {
      model,
      endpoint: pollinationsConfig().endpoint,
      auth: pollinationsConfig().auth,
      batches: batchCount,
      llmScored: results.filter((item) => item.source === "llm").length,
      fallbackScored: results.filter((item) => item.source === "heuristic").length,
      durationMs: Date.now() - started,
      notes,
    },
  };
}

/** Rank every given candidate against a single internship (recruiter view). */
export async function rankCandidatesForInternship(
  internship: Internship,
  candidates: CandidateProfile[],
): Promise<{ results: MatchResult[]; meta: AiRunMeta }> {
  const started = Date.now();
  const notes: string[] = [];
  const signals = new Map<string, OverlapSignal>();
  for (const candidate of candidates) {
    signals.set(candidate.id, overlapSignal(candidate, internship));
  }

  const byId = new Map(candidates.map((item) => [item.id, item]));
  const llmResults = new Map<string, MatchResult>();
  const batches = chunk(candidates, BATCH_SIZE);
  let model = pollinationsConfig().model;
  let batchCount = 0;

  for (const [index, batch] of batches.entries()) {
    batchCount += 1;
    const seed = hashString(
      `rank:${internship.id}:${batch.map((item) => item.id).join(",")}`,
    );
    const user = JSON.stringify({
      task: "rank_candidates_for_internship",
      internship: internshipPayload(internship),
      candidates: batch.map(candidatePayload),
      mechanicalOverlapHint: batch.map((candidate) => {
        const signal = signals.get(candidate.id);
        return {
          candidateId: candidate.id,
          localOverlapScore: signal?.overlapScore ?? 0,
          locallyMatchedSkills: signal?.matched ?? [],
          locallyMissing: signal?.gaps ?? [],
        };
      }),
    });

    try {
      const response = await chatJson<{ results?: RawEntry[] }>({
        system: CANDIDATE_SYSTEM_PROMPT,
        user,
        seed,
        maxTokens: 1800,
      });
      model = response.model;
      const entries = Array.isArray(response.data?.results) ? response.data.results : [];
      const seenIds = new Set<string>();
      for (const entry of entries) {
        const id = String(entry.candidateId ?? "");
        const candidate =
          byId.get(id) ??
          // Models sometimes echo the candidate's name instead of their id.
          candidates.find(
            (item) => norm(item.name) === norm(id) || norm(item.headline) === norm(id),
          );
        if (!candidate) {
          notes.push(`Batch ${index + 1}: unmatched candidateId "${id}".`);
          continue;
        }
        seenIds.add(candidate.id);
        const score = clamp(Math.round(asNumber(entry.score, 0)), 0, 100);
        // Key by the stored id: the model may have echoed a name instead.
        llmResults.set(candidate.id, {
          targetId: candidate.id,
          targetLabel: candidate.name,
          secondaryLabel: candidate.headline,
          score,
          verdict: normalizeVerdict(entry.verdict, score),
          matched: toArray(entry.strengths ?? entry.matched).slice(0, 5),
          gaps: toArray(entry.gaps).slice(0, 5),
          rationale: String(entry.rationale ?? "").trim() || "No rationale returned.",
          interviewQuestions: toArray(entry.interviewQuestions).slice(0, 3),
          source: "llm",
          model: response.model,
        });
      }
      if (entries.length === 0) {
        notes.push(`Batch ${index + 1}: the model returned no usable rows.`);
      }
      for (const item of batch) {
        if (!seenIds.has(item.id)) {
          notes.push(`Batch ${index + 1}: model returned no row for ${item.id}.`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`Batch ${index + 1} failed: ${message}`);
      if (!fallbackEnabled()) throw error;
    }

    if (index < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  const results = candidates.map((candidate) => {
    const fromLlm = llmResults.get(candidate.id);
    if (fromLlm) return fromLlm;
    const signal = signals.get(candidate.id) as OverlapSignal;
    return heuristicCandidateResult(internship, candidate, signal);
  });

  return {
    results: results.sort((a, b) => b.score - a.score),
    meta: {
      model,
      endpoint: pollinationsConfig().endpoint,
      auth: pollinationsConfig().auth,
      batches: batchCount,
      llmScored: results.filter((item) => item.source === "llm").length,
      fallbackScored: results.filter((item) => item.source === "heuristic").length,
      durationMs: Date.now() - started,
      notes,
    },
  };
}

// --- AI vacancy drafting ----------------------------------------------------

export interface DraftResult {
  description: string;
  responsibilities: string[];
  requirements: string[];
  tags: string[];
  skills: string[];
  source: "llm" | "heuristic";
  model: string;
}

export interface DraftInput {
  title: string;
  company: string;
  type: string;
  location: string;
  workMode: string;
  level: string;
  durationMonths: number;
  skills: string[];
  notes: string;
}

/**
 * Ask the LLM to draft the narrative parts of a vacancy. Used by the
 * "Draft with AI" button in the internship editor.
 */
export async function draftInternship(input: DraftInput): Promise<DraftResult> {
  const fallback: DraftResult = {
    description: `${input.company || "Our organisation"} is looking for an intern as ${input.title || "an intern"} in ${input.location || "Flanders"} (${input.workMode}). You join a small team, work on real assignments and get guidance from a mentor. This is a ${input.durationMonths}-month internship for a ${input.level} student.`,
    responsibilities: [
      "Take ownership of a concrete assignment from start to finish",
      "Work together with the team in ${workMode} mode",
      "Document what you build so colleagues can continue it",
      "Present your results at the end of the internship",
    ],
    requirements: [
      "Enrolled in a relevant study programme",
      "Interested in " + (input.skills[0] ?? "the field"),
      "Able to work independently",
      "Good communication skills",
    ],
    tags: ["internship", input.type || "general", input.location || "flanders"],
    skills: input.skills.slice(0, 6),
    source: "heuristic",
    model: "local-template-writer",
  };

  try {
    const response = await chatJson<{
      description?: unknown;
      responsibilities?: unknown;
      requirements?: unknown;
      tags?: unknown;
      skills?: unknown;
    }>({
      system: DRAFT_SYSTEM_PROMPT,
      user: JSON.stringify({ task: "draft_internship_vacancy", vacant: input }),
      seed: hashString(`draft:${input.title}:${input.type}:${input.location}`),
      maxTokens: 900,
      temperature: 0.6,
      retries: 1,
    });

    const data = response.data ?? {};
    return {
      description: String(data.description ?? fallback.description).trim(),
      responsibilities: toArray(data.responsibilities).slice(0, 6).length
        ? toArray(data.responsibilities).slice(0, 6)
        : fallback.responsibilities,
      requirements: toArray(data.requirements).slice(0, 6).length
        ? toArray(data.requirements).slice(0, 6)
        : fallback.requirements,
      tags: toArray(data.tags).slice(0, 6),
      skills: toArray(data.skills).slice(0, 6).length
        ? toArray(data.skills).slice(0, 6)
        : fallback.skills,
      source: "llm",
      model: response.model,
    };
  } catch (error) {
    if (!fallbackEnabled()) throw error;
    return fallback;
  }
}




