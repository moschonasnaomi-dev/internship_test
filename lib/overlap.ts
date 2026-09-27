import type { CandidateDraft, Internship, OverlapSignal } from "./types";
import { clamp, norm, uniq } from "./utils";

/**
 * Deterministic, explainable overlap check between one candidate and one
 * internship. It runs entirely locally (no network, no API key) and is used for
 * two purposes:
 *   1. as extra, verifiable signal handed to the LLM prompt, and
 *   2. as a transparent fallback so the app still returns scores when the free
 *      LLM endpoint is unreachable.
 *
 * Weights: skills 40, type 15, location/work mode 15, seniority 15, practical 15.
 */

const LEVEL_EXPECTATION: Record<string, number> = {
  secondary: 0,
  bachelor: 0,
  master: 0,
  graduate: 1,
  any: 0,
};

function educationScore(candidate: CandidateDraft, internship: Internship): number {
  const education = norm(candidate.education);
  const level = internship.level;
  if (level === "any") return 15;

  const hasSecondary = education.includes("secondary") || education.includes("secundair");
  const hasBachelor = education.includes("bachelor");
  const hasMaster = education.includes("master") || education.includes("msc");

  const ladder: Record<string, number> = { secondary: 0, bachelor: 1, master: 2 };
  const candidateStep = hasMaster ? 2 : hasBachelor ? 1 : hasSecondary ? 0 : 1;
  const requiredStep = ladder[level] ?? 1;

  if (candidateStep >= requiredStep) return 15;
  return candidateStep + 1 === requiredStep ? 10 : 6;
}

export function overlapSignal(
  candidate: CandidateDraft,
  internship: Internship,
): OverlapSignal {
  const candidateSkills = new Set(candidate.skills.map(norm));
  const requirementText = norm(
    [...internship.requirements, internship.description, ...internship.tags].join(" "),
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of internship.skills) {
    const key = norm(skill);
    if (candidateSkills.has(key)) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
      void requirementText;
    }
  }
  const required = internship.skills.length || 1;
  const skillPoints = Math.round(clamp(matchedSkills.length / required, 0, 1) * 40);

  const typeMatch = candidate.preferredTypes.some(
    (type) => norm(type) === norm(internship.type),
  );
  const typePoints = typeMatch ? 15 : internship.type === "corporate" ? 4 : 0;

  const locationExact = candidate.preferredLocations.some(
    (location) => norm(location) === norm(internship.location),
  );
  const locationFamily = candidate.preferredLocations.some(
    (location) =>
      norm(location).length > 3 &&
      (norm(internship.location).startsWith(norm(location)) ||
        norm(location).startsWith(norm(internship.location))),
  );
  const remoteAllowed =
    internship.workMode === "remote" && candidate.preferredWorkModes.includes("remote");
  const locationPoints = locationExact ? 15 : locationFamily ? 12 : remoteAllowed ? 10 : 0;

  const educationPoints = educationScore(candidate, internship);
  const expectedYears = LEVEL_EXPECTATION[internship.level] ?? 0;
  const yearsBonus = Math.min(candidate.experienceYears - expectedYears, 2);
  const seniorityPoints = clamp(educationPoints + (yearsBonus > 0 ? 2 : 0), 0, 15);

  const hoursPoints =
    internship.hoursPerWeek <= 0
      ? 8
      : Math.round(clamp(candidate.hoursPerWeek / internship.hoursPerWeek, 0, 1) * 8);
  const availabilityPoints =
    internship.durationMonths <= 0
      ? 4
      : Math.round(clamp(candidate.availabilityMonths / internship.durationMonths, 0, 1) * 4);
  const internshipLanguages = internship.languages.map(norm);
  const sharedLanguages = candidate.languages.filter((language) =>
    internshipLanguages.includes(norm(language)),
  );
  const languagePoints =
    internship.languages.length === 0 || sharedLanguages.length > 0 ? 3 : 0;
  const practicalPoints = hoursPoints + availabilityPoints + languagePoints;

  const total = clamp(
    skillPoints + typePoints + locationPoints + seniorityPoints + practicalPoints,
    0,
    100,
  );

  const gaps = uniq([
    ...missingSkills.slice(0, 3),
    ...(hoursPoints < 8 ? ["Fewer hours available than required"] : []),
    ...(availabilityPoints < 4 ? ["Availability shorter than the internship"] : []),
    ...(locationPoints === 0 ? ["Location/work mode not in preferences"] : []),
    ...(languagePoints === 0 && internship.languages.length > 0
      ? ["No shared working language"]
      : []),
  ]).slice(0, 5);

  return {
    overlapScore: total,
    breakdown: [
      {
        label: "Skills & domain",
        points: skillPoints,
        max: 40,
        detail: `${matchedSkills.length}/${internship.skills.length} internship skills found`,
      },
      {
        label: "Internship type",
        points: typePoints,
        max: 15,
        detail: typeMatch ? `Prefers ${internship.type}` : `No preference for ${internship.type}`,
      },
      {
        label: "Location & work mode",
        points: locationPoints,
        max: 15,
        detail: `${internship.location} (${internship.workMode})`,
      },
      {
        label: "Seniority",
        points: seniorityPoints,
        max: 15,
        detail: `${internship.level} vs ${candidate.experienceYears} year(s) of experience`,
      },
      {
        label: "Practical fit",
        points: practicalPoints,
        max: 15,
        detail: `${candidate.hoursPerWeek}h/week, ${candidate.availabilityMonths} month(s) available`,
      },
    ],
    matched: matchedSkills.slice(0, 5),
    gaps: gaps.length > 0 ? gaps : ["No mechanical blocker detected"],
  };
}
