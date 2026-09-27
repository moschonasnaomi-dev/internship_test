"use client";

import { useEffect, useMemo, useState } from "react";

import { emptyCandidateDraft } from "@/lib/forms";
import type { StorageInfo } from "@/lib/store";
import type {
  AiRunMeta,
  CandidateDraft,
  CandidateProfile,
  Internship,
  MatchResult,
  Taxonomies,
  WorkMode,
} from "@/lib/types";
import { STATUSES, WORK_MODES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

import { CandidateFields } from "./CandidateFields";
import { InternshipCard } from "./InternshipCard";
import { StorageBanner } from "./StorageBanner";
import { AiMetaPanel, Badge, ErrorNote } from "./ui";

const DRAFT_KEY = "internship-compass.candidate.v1";

interface Filters {
  q: string;
  types: string[];
  locations: string[];
  workModes: WorkMode[];
  statuses: string[];
  sort: "ai" | "deadline" | "start" | "stipend" | "title";
}

const defaultFilters: Filters = {
  q: "",
  types: [],
  locations: [],
  workModes: [],
  statuses: ["open", "draft"],
  sort: "ai",
};

export function Explorer({
  internships,
  taxonomies,
  candidates,
  storage,
}: {
  internships: Internship[];
  taxonomies: Taxonomies;
  candidates: CandidateProfile[];
  storage: StorageInfo;
}) {
  const [draft, setDraft] = useState<CandidateDraft>(() => emptyCandidateDraft());
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [matches, setMatches] = useState<Record<string, MatchResult>>({});
  const [meta, setMeta] = useState<AiRunMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  // The candidate draft is a browser-only convenience, so it never needs the API.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) setDraft({ ...emptyCandidateDraft(), ...(JSON.parse(raw) as CandidateDraft) });
    } catch {
      /* ignore unreadable storage */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore quota errors */
    }
  }, [draft, loaded]);

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    const result = internships.filter((internship) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(internship.status)) return false;
      if (filters.types.length > 0 && !filters.types.includes(internship.type)) return false;
      if (filters.locations.length > 0 && !filters.locations.includes(internship.location)) return false;
      if (filters.workModes.length > 0 && !filters.workModes.includes(internship.workMode)) return false;
      if (query) {
        const haystack = [
          internship.title,
          internship.company,
          internship.description,
          internship.location,
          internship.type,
          internship.skills.join(" "),
          internship.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const sorted = [...result];
    switch (filters.sort) {
      case "ai":
        sorted.sort(
          (a, b) => (matches[b.id]?.score ?? -1) - (matches[a.id]?.score ?? -1),
        );
        break;
      case "deadline":
        sorted.sort((a, b) =>
          (a.applicationDeadline ?? "9999").localeCompare(b.applicationDeadline ?? "9999"),
        );
        break;
      case "start":
        sorted.sort((a, b) => a.startDate.localeCompare(b.startDate));
        break;
      case "stipend":
        sorted.sort((a, b) => (b.stipendEurPerMonth ?? -1) - (a.stipendEurPerMonth ?? -1));
        break;
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [internships, filters, matches]);

  async function runMatch() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: draft,
          internshipIds: filtered.map((internship) => internship.id),
          includeClosed: filters.statuses.includes("closed"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || payload?.error || "Unknown error");
      const next: Record<string, MatchResult> = {};
      for (const result of payload.results as MatchResult[]) next[result.targetId] = result;
      setMatches(next);
      setMeta(payload.meta as AiRunMeta);
      setFilters((current) => ({ ...current, sort: "ai" }));
      setNotice(`Scored ${payload.results.length} internships with the free Pollinations LLM.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the profile");
      setNotice(`Saved "${payload.candidate.name}" as a candidate profile (id ${payload.candidate.id}).`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function clearMatch() {
    setMatches({});
    setMeta(null);
    setNotice("");
  }

  const activeMatchCount = Object.keys(matches).length;

  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
              Internship Compass
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              Find the internship that actually fits you
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {internships.length} internships, every field editable (type, location, skills,
              stipend, deadlines...). Fill in your profile and the free{" "}
              <a
                className="text-indigo-300 hover:underline"
                href="https://pollinations.ai"
                target="_blank"
                rel="noreferrer"
              >
                Pollinations.ai
              </a>{" "}
              LLM scores each vacancy and explains the gaps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {candidates.length > 0 ? (
              <select
                className="input w-auto"
                value=""
                onChange={(event) => {
                  const found = candidates.find((item) => item.id === event.target.value);
                  if (found) {
                    const {
                      id: _id,
                      createdAt: _createdAt,
                      updatedAt: _updatedAt,
                      ...rest
                    } = found;
                    void _id;
                    void _createdAt;
                    void _updatedAt;
                    setDraft(rest);
                    setNotice(`Loaded the sample profile "${found.name}".`);
                  }
                }}
              >
                <option value="">Load a sample profile…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {candidate.headline}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="btn-ghost" onClick={() => setDraft(emptyCandidateDraft())}>
              Clear profile
            </button>
          </div>
        </div>
      </section>

      <StorageBanner storage={storage} />

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="card card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Step 1 — your profile
            </h2>
            <Badge tone="neutral">stored in your browser only</Badge>
          </div>
          <CandidateFields value={draft} onChange={setDraft} taxonomies={taxonomies} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-ai"
              onClick={runMatch}
              disabled={busy || draft.name.trim() === ""}
            >
              {busy ? "Evaluating…" : `Rank ${filtered.length} internships with AI`}
            </button>
            <button
              className="btn-ghost"
              onClick={saveProfile}
              disabled={busy || draft.name.trim() === ""}
            >
              Save as candidate profile
            </button>
            {activeMatchCount > 0 ? (
              <button className="btn-ghost" onClick={clearMatch}>
                Clear AI results
              </button>
            ) : null}
          </div>
          {draft.name.trim() === "" ? (
            <p className="mt-2 text-[11px] text-amber-300">
              Add at least a name before asking the model to evaluate you.
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            <ErrorNote>{error}</ErrorNote>
            {notice ? (
              <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {notice}
              </p>
            ) : null}
          </div>
        </div>

        <div className="card card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Step 2 — filter the board
            </h2>
            <Badge tone="indigo">
              {filtered.length}/{internships.length} shown
            </Badge>
          </div>

          <input
            className="input"
            placeholder="Search title, company, skill, tag…"
            value={filters.q}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
          />

          <div className="mt-3">
            <p className="field-label">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {taxonomies.types.map((term) => (
                <button
                  key={term.value}
                  type="button"
                  className={`chip ${filters.types.includes(term.value) ? "chip-active" : ""}`}
                  onClick={() =>
                    setFilters({ ...filters, types: toggle(filters.types, term.value) })
                  }
                >
                  {term.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="field-label">Location</p>
            <div className="flex flex-wrap gap-1.5">
              {taxonomies.locations.map((term) => (
                <button
                  key={term.value}
                  type="button"
                  className={`chip ${filters.locations.includes(term.value) ? "chip-active" : ""}`}
                  onClick={() =>
                    setFilters({ ...filters, locations: toggle(filters.locations, term.value) })
                  }
                >
                  {term.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="field-label">Work mode</p>
              <div className="flex flex-wrap gap-1.5">
                {WORK_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`chip ${filters.workModes.includes(mode.value) ? "chip-active" : ""}`}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        workModes: toggle(filters.workModes, mode.value),
                      })
                    }
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={`chip ${filters.statuses.includes(status.value) ? "chip-active" : ""}`}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        statuses: toggle(filters.statuses, status.value),
                      })
                    }
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="field-label">Sort by</label>
            <select
              className="input"
              value={filters.sort}
              onChange={(event) =>
                setFilters({ ...filters, sort: event.target.value as Filters["sort"] })
              }
            >
              <option value="ai">AI match score (after evaluating)</option>
              <option value="deadline">Application deadline</option>
              <option value="start">Start date</option>
              <option value="stipend">Stipend</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>

          <button className="btn-ghost mt-3" onClick={() => setFilters({ ...defaultFilters })}>
            Reset filters
          </button>
        </div>
      </section>

      {meta ? <AiMetaPanel meta={meta} /> : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Step 3 — the board
          </h2>
          {activeMatchCount > 0 ? (
            <Badge tone="emerald">{activeMatchCount} AI scores loaded</Badge>
          ) : (
            <Badge tone="neutral">no AI scores yet</Badge>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="card card-pad text-sm text-slate-300">
            No internship matches these filters. Clear them, or add a new internship on the
            Manage page.
          </p>
        ) : null}

        {filtered.map((internship) => (
          <InternshipCard
            key={internship.id}
            internship={internship}
            taxonomies={taxonomies}
            result={matches[internship.id] ?? null}
            candidateForSignal={activeMatchCount > 0 ? draft : null}
          />
        ))}

        {filtered.length > 0 ? (
          <p className="text-xs text-slate-500">
            Earliest deadline in this selection:{" "}
            {formatDate(
              filtered
                .map((internship) => internship.applicationDeadline)
                .filter((value): value is string => Boolean(value))
                .sort()[0] ?? null,
            )}{" "}
            · scores are decision support, not decisions.
          </p>
        ) : null}
      </section>
    </div>
  );
}
