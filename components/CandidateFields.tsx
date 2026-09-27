"use client";

import type { CandidateDraft, Taxonomies, WorkMode } from "@/lib/types";
import { WORK_MODES } from "@/lib/types";

import { ChipPicker, ListInput } from "./ui";

/**
 * The editable candidate profile. Shared by the "find my internship" page and
 * the recruiter page, and deliberately free-form: every list field accepts
 * values that are not in the taxonomy yet.
 */
export function CandidateFields({
  value,
  onChange,
  taxonomies,
  showContact = true,
}: {
  value: CandidateDraft;
  onChange: (next: CandidateDraft) => void;
  taxonomies: Taxonomies;
  showContact?: boolean;
}) {
  const set = <K extends keyof CandidateDraft>(key: K, next: CandidateDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="field-label">Name</label>
        <input
          className="input"
          value={value.name}
          placeholder="e.g. Lotte Peeters"
          onChange={(event) => set("name", event.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Headline</label>
        <input
          className="input"
          value={value.headline}
          placeholder="e.g. Final-year bachelor applied informatics"
          onChange={(event) => set("headline", event.target.value)}
        />
      </div>

      <div>
        <label className="field-label">Education</label>
        <input
          className="input"
          value={value.education}
          placeholder="Programme, school, graduation moment"
          onChange={(event) => set("education", event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Experience (years)</label>
          <input
            className="input"
            type="number"
            min={0}
            step={0.5}
            value={value.experienceYears}
            onChange={(event) => set("experienceYears", Number(event.target.value))}
          />
        </div>
        <div>
          <label className="field-label">Available (months)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={value.availabilityMonths}
            onChange={(event) => set("availabilityMonths", Number(event.target.value))}
          />
        </div>
      </div>

      <div className="md:col-span-2">
        <ListInput
          label="Skills"
          values={value.skills}
          onChange={(next) => set("skills", next)}
          suggestions={taxonomies.skills}
          placeholder="Type a skill and press Enter"
          hint="The AI weighs these against the internship requirements."
        />
      </div>

      <div className="md:col-span-2">
        <label className="field-label">Experience summary</label>
        <textarea
          className="input min-h-[80px]"
          value={value.experienceSummary}
          placeholder="Projects, internships, student jobs, thesis topic ..."
          onChange={(event) => set("experienceSummary", event.target.value)}
        />
      </div>

      <ChipPicker
        label="Preferred internship types"
        options={taxonomies.types}
        selected={value.preferredTypes}
        onChange={(next) => set("preferredTypes", next)}
        hint="Edit these in Manage internships → option lists."
      />
      <ChipPicker
        label="Preferred locations"
        options={taxonomies.locations}
        selected={value.preferredLocations}
        onChange={(next) => set("preferredLocations", next)}
      />

      <ChipPicker
        label="Preferred work modes"
        options={WORK_MODES as { value: string; label: string }[]}
        selected={value.preferredWorkModes}
        onChange={(next) => set("preferredWorkModes", next as WorkMode[])}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Hours per week</label>
          <input
            className="input"
            type="number"
            min={0}
            max={60}
            value={value.hoursPerWeek}
            onChange={(event) => set("hoursPerWeek", Number(event.target.value))}
          />
        </div>
        <ListInput
          label="Languages"
          values={value.languages}
          onChange={(next) => set("languages", next)}
          suggestions={taxonomies.languages}
        />
      </div>

      {showContact ? (
        <>
          <div>
            <label className="field-label">Email</label>
            <input
              className="input"
              value={value.email}
              placeholder="name@example.com"
              onChange={(event) => set("email", event.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Portfolio / LinkedIn</label>
            <input
              className="input"
              value={value.portfolioUrl}
              placeholder="https://"
              onChange={(event) => set("portfolioUrl", event.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="md:col-span-2">
        <label className="field-label">Notes for the evaluator</label>
        <textarea
          className="input min-h-[60px]"
          value={value.notes}
          placeholder="Motivation, constraints, must-haves ..."
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </div>
  );
}
