import type {
  CandidateDraft,
  Internship,
  InternshipDraft,
  Taxonomies,
} from "./types";

/** Empty form values, shared by the create/edit screens. */

export function emptyInternshipDraft(taxonomies: Taxonomies): InternshipDraft {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() + 3);

  return {
    title: "",
    company: "",
    type: taxonomies.types[0]?.value ?? "corporate",
    location: taxonomies.locations[0]?.value ?? "Limburg",
    country: "Belgium",
    workMode: "hybrid",
    level: "bachelor",
    durationMonths: 4,
    hoursPerWeek: 38,
    stipendEurPerMonth: 450,
    startDate: start.toISOString().slice(0, 10),
    applicationDeadline: null,
    languages: ["Dutch", "English"],
    skills: [],
    tags: [],
    description: "",
    responsibilities: [],
    requirements: [],
    perks: [],
    contactEmail: "",
    url: "",
    status: "open",
  };
}

export function internshipToDraft(internship: Internship): InternshipDraft {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...draft
  } = internship;
  void _id;
  void _createdAt;
  void _updatedAt;
  return draft;
}

export function emptyCandidateDraft(): CandidateDraft {
  return {
    name: "",
    headline: "",
    email: "",
    education: "",
    experienceYears: 0,
    experienceSummary: "",
    skills: [],
    languages: ["Dutch", "English"],
    preferredTypes: [],
    preferredLocations: ["Limburg"],
    preferredWorkModes: ["hybrid"],
    availabilityMonths: 4,
    hoursPerWeek: 38,
    portfolioUrl: "",
    notes: "",
  };
}
