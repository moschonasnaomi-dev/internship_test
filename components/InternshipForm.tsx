"use client";

import { useState } from "react";

import { emptyInternshipDraft, internshipToDraft } from "@/lib/forms";
import type { Internship, InternshipDraft, Taxonomies } from "@/lib/types";
import { LEVELS, STATUSES, WORK_MODES } from "@/lib/types";

import { ErrorNote, ListInput } from "./ui";

/**
 * Create / edit one internship. Everything is editable: `type` and `location`
 * are free-text inputs with suggestions from the editable taxonomy, so a brand
 * new value such as "devshop" or "Limburg" can simply be typed in.
 */
export function InternshipForm({
  initial,
  taxonomies,
  onSaved,
  onCancel,
}: {
  initial: Internship | null;
  taxonomies: Taxonomies;
  onSaved: (internship: Internship) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<InternshipDraft>(() =>
    initial ? internshipToDraft(initial) : emptyInternshipDraft(taxonomies),
  );
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const set = <K extends keyof InternshipDraft>(key: K, value: InternshipDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function draftWithAi() {
    setDrafting(true);
    setError("");
    setHint("");
    try {
      const response = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          company: draft.company,
          type: draft.type,
          location: draft.location,
          workMode: draft.workMode,
          level: draft.level,
          durationMonths: draft.durationMonths,
          skills: draft.skills,
          notes: draft.description,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || payload?.error || "Drafting failed");
      const next = payload.draft as {
        description: string;
        responsibilities: string[];
        requirements: string[];
        tags: string[];
        skills: string[];
        source: string;
        model: string;
      };
      setDraft((current) => ({
        ...current,
        description: next.description || current.description,
        responsibilities: next.responsibilities.length
          ? next.responsibilities
          : current.responsibilities,
        requirements: next.requirements.length ? next.requirements : current.requirements,
        tags: next.tags.length ? next.tags : current.tags,
        skills: current.skills.length ? current.skills : next.skills,
      }));
      setHint(
        next.source === "llm"
          ? `Drafted by ${next.model} via Pollinations. Review it before saving.`
          : "The model was unreachable, so a local template was used.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        initial ? `/api/internships/${initial.id}` : "/api/internships",
        {
          method: initial ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Saving failed");
      onSaved(payload.internship as Internship);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">
          {initial ? `Edit: ${initial.title}` : "New internship"}
        </h3>
        <div className="flex gap-2">
          <button className="btn-ai" onClick={draftWithAi} disabled={drafting}>
            {drafting ? "Drafting…" : "✨ Draft with AI"}
          </button>
          <button className="btn-ghost" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>

      {hint ? (
        <p className="mb-3 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
          {hint}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="field-label">Title</label>
          <input
            className="input"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="e.g. Full-stack developer internship (React + Node)"
          />
        </div>

        <div>
          <label className="field-label">Company</label>
          <input
            className="input"
            value={draft.company}
            onChange={(event) => set("company", event.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Type (editable list)</label>
          <input
            className="input"
            list="taxonomy-types"
            value={draft.type}
            onChange={(event) => set("type", event.target.value)}
          />
          <datalist id="taxonomy-types">
            {taxonomies.types.map((term) => (
              <option key={term.value} value={term.value}>
                {term.label}
              </option>
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label">Location (editable list)</label>
          <input
            className="input"
            list="taxonomy-locations"
            value={draft.location}
            onChange={(event) => set("location", event.target.value)}
          />
          <datalist id="taxonomy-locations">
            {taxonomies.locations.map((term) => (
              <option key={term.value} value={term.value}>
                {term.label}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label">Country</label>
          <input
            className="input"
            value={draft.country}
            onChange={(event) => set("country", event.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Work mode</label>
          <select
            className="input"
            value={draft.workMode}
            onChange={(event) =>
              set("workMode", event.target.value as InternshipDraft["workMode"])
            }
          >
            {WORK_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Level</label>
          <select
            className="input"
            value={draft.level}
            onChange={(event) => set("level", event.target.value as InternshipDraft["level"])}
          >
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Status</label>
          <select
            className="input"
            value={draft.status}
            onChange={(event) => set("status", event.target.value as InternshipDraft["status"])}
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Stipend (€/month, empty = unpaid)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={draft.stipendEurPerMonth ?? ""}
            onChange={(event) =>
              set(
                "stipendEurPerMonth",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Duration (months)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.durationMonths}
              onChange={(event) => set("durationMonths", Number(event.target.value))}
            />
          </div>
          <div>
            <label className="field-label">Hours / week</label>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.hoursPerWeek}
              onChange={(event) => set("hoursPerWeek", Number(event.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Start date</label>
            <input
              className="input"
              type="date"
              value={draft.startDate}
              onChange={(event) => set("startDate", event.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Apply before</label>
            <input
              className="input"
              type="date"
              value={draft.applicationDeadline ?? ""}
              onChange={(event) =>
                set("applicationDeadline", event.target.value === "" ? null : event.target.value)
              }
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="field-label">Description</label>
          <textarea
            className="input min-h-[120px]"
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Who you are, what the intern will build, how the team works…"
          />
        </div>

        <ListInput
          label="Skills"
          values={draft.skills}
          onChange={(next) => set("skills", next)}
          suggestions={taxonomies.skills}
          hint="Used by the LLM and the overlap check."
        />
        <ListInput
          label="Languages"
          values={draft.languages}
          onChange={(next) => set("languages", next)}
          suggestions={taxonomies.languages}
        />
        <ListInput
          label="Responsibilities (one per entry)"
          values={draft.responsibilities}
          onChange={(next) => set("responsibilities", next)}
        />
        <ListInput
          label="Requirements (one per entry)"
          values={draft.requirements}
          onChange={(next) => set("requirements", next)}
        />
        <ListInput
          label="Tags"
          values={draft.tags}
          onChange={(next) => set("tags", next)}
        />
        <ListInput
          label="Perks"
          values={draft.perks}
          onChange={(next) => set("perks", next)}
        />

        <div>
          <label className="field-label">Contact email</label>
          <input
            className="input"
            value={draft.contactEmail}
            onChange={(event) => set("contactEmail", event.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Vacancy URL</label>
          <input
            className="input"
            value={draft.url}
            onChange={(event) => set("url", event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={save} disabled={busy || draft.title.trim() === ""}>
            {busy ? "Saving…" : initial ? "Save changes" : "Create internship"}
          </button>
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
