import candidatesSeed from "@/data/candidates.json";
import internshipsSeed from "@/data/internships.json";
import taxonomiesSeed from "@/data/taxonomies.json";
import type {
  CandidateProfile,
  DatabaseShape,
  Internship,
  Taxonomies,
} from "./types";

/**
 * The bundled seed data. It is compiled into the deployment and used to create a
 * fresh database the first time the app runs (locally or on Vercel).
 *
 * Users edit their own copy at runtime - the JSON files in /data are never
 * mutated, so a redeploy always has a clean fallback.
 */

export const SCHEMA_VERSION = 1;

export function seedInternships(): Internship[] {
  return (internshipsSeed as Internship[]).map((item) => ({ ...item }));
}

export function seedCandidates(): CandidateProfile[] {
  return (candidatesSeed as CandidateProfile[]).map((item) => ({ ...item }));
}

export function seedTaxonomies(): Taxonomies {
  return JSON.parse(JSON.stringify(taxonomiesSeed)) as Taxonomies;
}

export function seedDatabase(): DatabaseShape {
  return {
    version: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    internships: seedInternships(),
    candidates: seedCandidates(),
    taxonomies: seedTaxonomies(),
  };
}

/**
 * Guarantees that every value used by an internship exists in the taxonomy so
 * the dropdowns never lose an option the user typed in earlier.
 */
export function reconcileTaxonomies(db: DatabaseShape): Taxonomies {
  const taxonomies = db.taxonomies ?? seedTaxonomies();
  const types = [...(taxonomies.types ?? [])];
  const locations = [...(taxonomies.locations ?? [])];
  const skills = new Set([...(taxonomies.skills ?? [])]);
  const languages = new Set([...(taxonomies.languages ?? [])]);

  const knownTypes = new Set(types.map((term) => term.value.toLowerCase()));
  const knownLocations = new Set(
    locations.map((term) => term.value.toLowerCase()),
  );

  for (const internship of db.internships) {
    if (internship.type && !knownTypes.has(internship.type.toLowerCase())) {
      knownTypes.add(internship.type.toLowerCase());
      types.push({ value: internship.type, label: internship.type });
    }
    if (
      internship.location &&
      !knownLocations.has(internship.location.toLowerCase())
    ) {
      knownLocations.add(internship.location.toLowerCase());
      locations.push({ value: internship.location, label: internship.location });
    }
    internship.skills?.forEach((skill) => skills.add(skill));
    internship.languages?.forEach((language) => languages.add(language));
  }

  for (const candidate of db.candidates ?? []) {
    candidate.skills?.forEach((skill) => skills.add(skill));
    candidate.languages?.forEach((language) => languages.add(language));
    candidate.preferredTypes?.forEach((type) => {
      if (!knownTypes.has(type.toLowerCase())) {
        knownTypes.add(type.toLowerCase());
        types.push({ value: type, label: type });
      }
    });
    candidate.preferredLocations?.forEach((location) => {
      if (!knownLocations.has(location.toLowerCase())) {
        knownLocations.add(location.toLowerCase());
        locations.push({ value: location, label: location });
      }
    });
  }

  return {
    types,
    locations,
    skills: [...skills].sort((a, b) => a.localeCompare(b)),
    languages: [...languages].sort((a, b) => a.localeCompare(b)),
  };
}
