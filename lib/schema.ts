import type {
  CandidateProfile,
  Internship,
  InternshipLevel,
  InternshipStatus,
  Taxonomies,
  WorkMode,
} from "./types";
import { asNumber, parseList, uid, uniq } from "./utils";

/**
 * Normalisation + validation for anything that comes in from the client.
 * Keeping it here means every API route stays thin and edits can never corrupt
 * the stored shape (unknown fields are dropped, numbers are clamped, lists are
 * de-duplicated).
 */

const WORK_MODE_VALUES: WorkMode[] = ["onsite", "hybrid", "remote"];
const LEVEL_VALUES: InternshipLevel[] = [
  "secondary",
  "bachelor",
  "master",
  "graduate",
  "any",
];
const STATUS_VALUES: InternshipStatus[] = ["open", "closed", "draft"];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const raw = String(value ?? "").trim().toLowerCase();
  const found = allowed.find((item) => item.toLowerCase() === raw);
  return found ?? fallback;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function isoDate(value: unknown, fallback = ""): string {
  const raw = text(value);
  if (!raw) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

export function normalizeInternship(
  input: unknown,
  existing?: Internship,
): Internship {
  const raw = (input ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const stipend = raw.stipendEurPerMonth;

  return {
    id: text(raw.id) || existing?.id || uid("it"),
    title: text(raw.title, existing?.title ?? "Untitled internship"),
    company: text(raw.company, existing?.company ?? ""),
    type: text(raw.type, existing?.type ?? "corporate"),
    location: text(raw.location, existing?.location ?? "Limburg"),
    country: text(raw.country, existing?.country ?? "Belgium"),
    workMode: pick(raw.workMode, WORK_MODE_VALUES, existing?.workMode ?? "hybrid"),
    level: pick(raw.level, LEVEL_VALUES, existing?.level ?? "any"),
    durationMonths: Math.max(
      0,
      Math.round(asNumber(raw.durationMonths, existing?.durationMonths ?? 3)),
    ),
    hoursPerWeek: Math.max(
      0,
      Math.round(asNumber(raw.hoursPerWeek, existing?.hoursPerWeek ?? 38)),
    ),
    stipendEurPerMonth:
      stipend === null || stipend === undefined || stipend === ""
        ? null
        : Math.max(0, Math.round(asNumber(stipend, 0))),
    startDate: isoDate(raw.startDate, existing?.startDate ?? now.slice(0, 10)),
    applicationDeadline:
      raw.applicationDeadline === null || raw.applicationDeadline === undefined
        ? null
        : isoDate(raw.applicationDeadline, "") || null,
    languages: parseList(raw.languages as string | string[]),
    skills: parseList(raw.skills as string | string[]),
    tags: parseList(raw.tags as string | string[]),
    description: text(raw.description, existing?.description ?? ""),
    responsibilities: parseList(raw.responsibilities as string | string[]),
    requirements: parseList(raw.requirements as string | string[]),
    perks: parseList(raw.perks as string | string[]),
    contactEmail: text(raw.contactEmail, existing?.contactEmail ?? ""),
    url: text(raw.url, existing?.url ?? ""),
    status: pick(raw.status, STATUS_VALUES, existing?.status ?? "open"),
    createdAt: existing?.createdAt ?? (text(raw.createdAt) || now),
    updatedAt: now,
  };
}

export function normalizeCandidate(
  input: unknown,
  existing?: CandidateProfile,
): CandidateProfile {
  const raw = (input ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const modes = Array.isArray(raw.preferredWorkModes)
    ? (raw.preferredWorkModes as unknown[])
    : parseList(raw.preferredWorkModes as string | string[]);

  return {
    id: text(raw.id) || existing?.id || uid("cd"),
    name: text(raw.name, existing?.name ?? "New candidate"),
    headline: text(raw.headline, existing?.headline ?? ""),
    email: text(raw.email, existing?.email ?? ""),
    education: text(raw.education, existing?.education ?? ""),
    experienceYears: Math.max(
      0,
      asNumber(raw.experienceYears, existing?.experienceYears ?? 0),
    ),
    experienceSummary: text(raw.experienceSummary, existing?.experienceSummary ?? ""),
    skills: parseList(raw.skills as string | string[]),
    languages: parseList(raw.languages as string | string[]),
    preferredTypes: parseList(raw.preferredTypes as string | string[]),
    preferredLocations: parseList(raw.preferredLocations as string | string[]),
    preferredWorkModes: uniq(
      modes.map((mode) => pick(mode, WORK_MODE_VALUES, "hybrid")),
    ) as WorkMode[],
    availabilityMonths: Math.max(
      0,
      Math.round(asNumber(raw.availabilityMonths, existing?.availabilityMonths ?? 3)),
    ),
    hoursPerWeek: Math.max(
      0,
      Math.round(asNumber(raw.hoursPerWeek, existing?.hoursPerWeek ?? 38)),
    ),
    portfolioUrl: text(raw.portfolioUrl, existing?.portfolioUrl ?? ""),
    notes: text(raw.notes, existing?.notes ?? ""),
    createdAt: existing?.createdAt ?? (text(raw.createdAt) || now),
    updatedAt: now,
  };
}

export function normalizeTaxonomies(input: unknown, base: Taxonomies): Taxonomies {
  const raw = (input ?? {}) as Record<string, unknown>;

  const termList = (
    value: unknown,
    fallback: { value: string; label: string }[],
  ): { value: string; label: string }[] => {
    if (!Array.isArray(value)) return fallback;
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const entry of value) {
      const term = (entry ?? {}) as Record<string, unknown>;
      const termValue = text(term.value);
      if (!termValue) continue;
      const key = termValue.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: termValue, label: text(term.label) || termValue });
    }
    return out.length > 0 ? out : fallback;
  };

  const languages = parseList(raw.languages as string | string[]);
  const skills = parseList(raw.skills as string | string[]);

  return {
    types: termList(raw.types, base.types),
    locations: termList(raw.locations, base.locations),
    languages: languages.length > 0 ? languages : base.languages,
    skills: skills.length > 0 ? skills : base.skills,
  };
}
