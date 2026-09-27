/**
 * Domain types for Internship Compass.
 *
 * Every free-text dimension of an internship (type, location, work mode, level,
 * skills, tags, languages) is editable from the UI, and the taxonomies that
 * back the dropdowns (types / locations / skills) are editable too - the user
 * can add their own values such as `type: devshop` or `location: Limburg`.
 */

export type Id = string;

export type WorkMode = "onsite" | "hybrid" | "remote";

export const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

export type InternshipLevel =
  | "secondary"
  | "bachelor"
  | "master"
  | "graduate"
  | "any";

export const LEVELS: { value: InternshipLevel; label: string }[] = [
  { value: "secondary", label: "Secondary school" },
  { value: "bachelor", label: "Bachelor" },
  { value: "master", label: "Master" },
  { value: "graduate", label: "Graduate / first job" },
  { value: "any", label: "Any level" },
];

export type InternshipStatus = "open" | "closed" | "draft";

export const STATUSES: { value: InternshipStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "draft", label: "Draft" },
];

export interface Internship {
  id: Id;
  title: string;
  company: string;
  /** Taxonomy key, e.g. `devshop`, `corporate`, `startup` ... freely editable. */
  type: string;
  /** Taxonomy key, e.g. `Limburg`, `Limburg - Hasselt`, `Brussels` ... */
  location: string;
  country: string;
  workMode: WorkMode;
  level: InternshipLevel;
  durationMonths: number;
  hoursPerWeek: number;
  stipendEurPerMonth: number | null;
  /** ISO date (yyyy-mm-dd). */
  startDate: string;
  /** ISO date or null. */
  applicationDeadline: string | null;
  languages: string[];
  skills: string[];
  tags: string[];
  description: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  contactEmail: string;
  url: string;
  status: InternshipStatus;
  createdAt: string;
  updatedAt: string;
}

/** A taxonomy entry is just a machine value plus a human label. */
export interface TaxonomyTerm {
  value: string;
  label: string;
}

export interface Taxonomies {
  types: TaxonomyTerm[];
  locations: TaxonomyTerm[];
  languages: string[];
  skills: string[];
}

export interface CandidateProfile {
  id: Id;
  name: string;
  headline: string;
  email: string;
  education: string;
  experienceYears: number;
  experienceSummary: string;
  skills: string[];
  languages: string[];
  preferredTypes: string[];
  preferredLocations: string[];
  preferredWorkModes: WorkMode[];
  availabilityMonths: number;
  hoursPerWeek: number;
  portfolioUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type Verdict = "strong" | "good" | "possible" | "weak";

export interface MatchResult {
  targetId: Id;
  targetLabel: string;
  secondaryLabel: string;
  score: number;
  verdict: Verdict;
  matched: string[];
  gaps: string[];
  rationale: string;
  /** Only produced when ranking candidates for a single internship. */
  interviewQuestions: string[];
  /** `llm` when Pollinations produced the score, `heuristic` for the fallback. */
  source: "llm" | "heuristic";
  model: string;
}

export interface AiRunMeta {
  model: string;
  endpoint: string;
  auth: "api-key" | "anonymous";
  batches: number;
  llmScored: number;
  fallbackScored: number;
  durationMs: number;
  notes: string[];
}

/** Deterministic local overlap check, used as a hint for the LLM and as fallback. */
export interface OverlapSignal {
  /** 0-100 mechanical overlap score, always computed locally. */
  overlapScore: number;
  breakdown: { label: string; points: number; max: number; detail: string }[];
  matched: string[];
  gaps: string[];
}

/** One stored candidate / one request body for evaluation. */
export type InternshipInput = Omit<Internship, "createdAt" | "updatedAt"> &
  Partial<Pick<Internship, "createdAt" | "updatedAt">> & { id?: Id };

export type CandidateInput = Omit<CandidateProfile, "createdAt" | "updatedAt"> &
  Partial<Pick<CandidateProfile, "createdAt" | "updatedAt">> & { id?: Id };

/** Shape used by the editable forms before anything is saved. */
export type CandidateDraft = Omit<CandidateProfile, "id" | "createdAt" | "updatedAt">;
export type InternshipDraft = Omit<Internship, "id" | "createdAt" | "updatedAt">;

export interface DatabaseShape {
  version: number;
  updatedAt: string;
  internships: Internship[];
  candidates: CandidateProfile[];
  taxonomies: Taxonomies;
}
