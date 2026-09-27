"use client";

import { useMemo, useState } from "react";

import type { StorageInfo } from "@/lib/store";
import type {
  CandidateProfile,
  Internship,
  Taxonomies,
} from "@/lib/types";
import { labelFrom, relativeTime } from "@/lib/utils";

import { CandidateFields } from "./CandidateFields";
import { InternshipForm } from "./InternshipForm";
import { StorageBanner } from "./StorageBanner";
import { Badge, ErrorNote, ListInput } from "./ui";

type Tab = "internships" | "options" | "candidates" | "data";

const TABS: { id: Tab; label: string }[] = [
  { id: "internships", label: "Internships" },
  { id: "options", label: "Option lists" },
  { id: "candidates", label: "Candidate profiles" },
  { id: "data", label: "Data" },
];

/**
 * Full admin surface: CRUD on internships, editing of the taxonomy that backs
 * every dropdown, candidate profile management and import/export of the whole
 * database.
 */
export function ManageClient({
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
  const [rows, setRows] = useState<Internship[]>(internships);
  const [tax, setTax] = useState<Taxonomies>(taxonomies);
  const [cands, setCands] = useState<CandidateProfile[]>(candidates);
  const [tab, setTab] = useState<Tab>("internships");
  const [editing, setEditing] = useState<Internship | "new" | null>(null);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [newCandidate, setNewCandidate] = useState<CandidateProfile | null>(null);
  const [candidateDraft, setCandidateDraft] = useState<CandidateProfile | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) =>
        needle
          ? `${row.title} ${row.company} ${row.type} ${row.location} ${row.tags.join(" ")}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [rows, query]);

  async function call<T>(url: string, init: RequestInit): Promise<T | null> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      return payload as T;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function onSaved(internship: Internship) {
    setRows((current) => {
      const exists = current.some((item) => item.id === internship.id);
      return exists
        ? current.map((item) => (item.id === internship.id ? internship : item))
        : [internship, ...current];
    });
    setEditing(null);
    setNotice(`Saved "${internship.title}".`);
    void call<{ taxonomies: Taxonomies }>("/api/taxonomies", {
      method: "PUT",
      body: JSON.stringify(tax),
    }).then((payload) => {
      if (payload?.taxonomies) setTax(payload.taxonomies);
    });
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const payload = await call<{ ok: boolean }>(`/api/internships/${id}`, { method: "DELETE" });
    if (payload?.ok) {
      setRows((current) => current.filter((item) => item.id !== id));
      setNotice(`Deleted "${title}".`);
    }
  }

  async function saveTaxonomies() {
    const payload = await call<{ taxonomies: Taxonomies }>("/api/taxonomies", {
      method: "PUT",
      body: JSON.stringify(tax),
    });
    if (payload?.taxonomies) {
      setTax(payload.taxonomies);
      setNotice("Option lists saved. New values appear in every dropdown and filter.");
    }
  }

  async function saveCandidate(candidate: CandidateProfile) {
    const isNew = !cands.some((item) => item.id === candidate.id);
    const payload = await call<{ candidate: CandidateProfile }>(
      isNew ? "/api/candidates" : `/api/candidates/${candidate.id}`,
      { method: isNew ? "POST" : "PUT", body: JSON.stringify(candidate) },
    );
    if (payload?.candidate) {
      setCands((current) => {
        const exists = current.some((item) => item.id === payload.candidate.id);
        return exists
          ? current.map((item) => (item.id === payload.candidate.id ? payload.candidate : item))
          : [payload.candidate, ...current];
      });
      setExpandedCandidate(null);
      setNotice(`Saved candidate "${payload.candidate.name}".`);
    }
  }

  async function removeCandidate(candidate: CandidateProfile) {
    if (!window.confirm(`Delete candidate "${candidate.name}"?`)) return;
    const payload = await call<{ ok: boolean }>(`/api/candidates/${candidate.id}`, {
      method: "DELETE",
    });
    if (payload?.ok) {
      setCands((current) => current.filter((item) => item.id !== candidate.id));
    }
  }

  async function importDatabase() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setError("That is not valid JSON. Export first and paste the file contents.");
      return;
    }
    const payload = await call<{ summary: { internships: number; candidates: number } }>(
      `/api/db?mode=${importMode}`,
      { method: "POST", body: JSON.stringify(parsed) },
    );
    if (payload) {
      const refresh = await call<{
        internships: Internship[];
        candidates: CandidateProfile[];
        taxonomies: Taxonomies;
      }>("/api/internships", { method: "GET" });
      if (refresh) {
        setRows(refresh.internships);
        setCands(refresh.candidates);
        setTax(refresh.taxonomies);
      }
      setNotice(
        `Import done (${importMode}). The database now holds ${payload.summary.internships} internships and ${payload.summary.candidates} candidates.`,
      );
      setImportText("");
    }
  }

  async function resetDatabase() {
    if (!window.confirm("Restore the bundled seed data and discard all edits?")) return;
    const payload = await call<{ counts: { internships: number; candidates: number } }>("/api/db", {
      method: "DELETE",
    });
    if (payload) {
      const refresh = await call<{
        internships: Internship[];
        candidates: CandidateProfile[];
        taxonomies: Taxonomies;
      }>("/api/internships", { method: "GET" });
      if (refresh) {
        setRows(refresh.internships);
        setCands(refresh.candidates);
        setTax(refresh.taxonomies);
      }
      setNotice(
        `Seed data restored: ${payload.counts.internships} internships, ${payload.counts.candidates} candidates.`,
      );
    }
  }

  async function cycleStatus(internship: Internship) {
    const order: Internship["status"][] = ["open", "draft", "closed"];
    const next = order[(order.indexOf(internship.status) + 1) % order.length];
    const payload = await call<{ internship: Internship }>(`/api/internships/${internship.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    if (payload?.internship) {
      setRows((current) =>
        current.map((item) => (item.id === internship.id ? payload.internship : item)),
      );
    }
  }

  const statusTone = (status: Internship["status"]) =>
    status === "open" ? "emerald" : status === "draft" ? "amber" : "rose";

  function blankCandidate(): CandidateProfile {
    const now = new Date().toISOString();
    return {
      id: "",
      name: "",
      headline: "",
      email: "",
      education: "",
      experienceYears: 0,
      experienceSummary: "",
      skills: [],
      languages: ["Dutch", "English"],
      preferredTypes: [],
      preferredLocations: [],
      preferredWorkModes: ["hybrid"],
      availabilityMonths: 4,
      hoursPerWeek: 38,
      portfolioUrl: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  return (
    <div className="space-y-6">
      <header className="card card-pad">
        <h1 className="text-2xl font-bold text-white">Manage internships</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Create, edit and archive internships, curate the option lists behind every dropdown, keep
          candidate profiles and export the whole database as JSON.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "btn-primary" : "btn-ghost"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === "internships" ? ` (${rows.length})` : null}
              {item.id === "candidates" ? ` (${cands.length})` : null}
            </button>
          ))}
        </div>
      </header>

      <StorageBanner storage={storage} />

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {notice}
        </p>
      ) : null}

      {tab === "internships" ? (
        <section className="space-y-4">
          {editing ? (
            <InternshipForm
              initial={editing === "new" ? null : editing}
              taxonomies={tax}
              onSaved={onSaved}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => setEditing("new")}>
              + New internship
            </button>
            <input
              className="input max-w-xs"
              placeholder="Filter by title, company, type, location…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className="text-xs text-slate-400">
              {filtered.length} of {rows.length} internships
            </span>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="table-head px-4 py-3">Internship</th>
                  <th className="table-head px-4 py-3">Type</th>
                  <th className="table-head px-4 py-3">Location</th>
                  <th className="table-head px-4 py-3">Status</th>
                  <th className="table-head px-4 py-3">Updated</th>
                  <th className="table-head px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((internship) => (
                  <tr key={internship.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{internship.title}</p>
                      <p className="text-xs text-slate-400">
                        {internship.company || "—"} · {internship.durationMonths}m ·{" "}
                        {internship.hoursPerWeek}h
                        {internship.stipendEurPerMonth !== null
                          ? ` · €${internship.stipendEurPerMonth}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="indigo">{labelFrom(tax.types, internship.type)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {labelFrom(tax.locations, internship.location)}
                      <span className="block text-xs text-slate-500">{internship.workMode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => cycleStatus(internship)} title="Click to cycle status">
                        <Badge tone={statusTone(internship.status)}>{internship.status}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {relativeTime(internship.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => setEditing(internship)}>
                          Edit
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => remove(internship.id, internship.title)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "options" ? (
        <section className="space-y-4">
          <div className="card card-pad text-sm text-slate-300">
            <h2 className="mb-1 text-sm font-semibold text-white">Editable option lists</h2>
            <p className="text-xs text-slate-400">
              These lists feed every dropdown and filter chip in the app. The <em>value</em> is what
              gets stored on an internship (e.g. <code>devshop</code>); the <em>label</em> is what
              people see (e.g. <code>Devshop / Software house</code>). Renaming a label is safe:
              existing internships keep the same value.
            </p>
          </div>

          <TermEditor
            title="Internship types"
            terms={tax.types}
            onChange={(terms) => setTax({ ...tax, types: terms })}
            placeholderValue="e.g. devshop"
            placeholderLabel="e.g. Devshop / Software house"
          />

          <TermEditor
            title="Locations"
            terms={tax.locations}
            onChange={(terms) => setTax({ ...tax, locations: terms })}
            placeholderValue="e.g. Limburg"
            placeholderLabel="e.g. Limburg (BE)"
          />

          <div className="card card-pad">
            <div className="grid gap-4 md:grid-cols-2">
              <ListInput
                label="Languages"
                values={tax.languages}
                onChange={(next) => setTax({ ...tax, languages: next })}
              />
              <ListInput
                label="Skill suggestions"
                values={tax.skills}
                onChange={(next) => setTax({ ...tax, skills: next })}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={saveTaxonomies} disabled={busy}>
                {busy ? "Saving…" : "Save option lists"}
              </button>
              <span className="text-xs text-slate-400">
                Internships referencing a value that is no longer listed keep working; the value is
                simply re-added automatically.
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "candidates" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => setNewCandidate(blankCandidate())}>
              + New candidate profile
            </button>
            <span className="text-xs text-slate-400">
              Candidate profiles are stored in the database so the recruiter page can rank them
              against a vacancy.
            </span>
          </div>

          {newCandidate ? (
            <div className="card card-pad">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">New candidate profile</h3>
                <button className="btn-ghost" onClick={() => setNewCandidate(null)}>
                  Close
                </button>
              </div>
              <CandidateFields
                value={newCandidate}
                onChange={(next) => setNewCandidate({ ...newCandidate, ...next })}
                taxonomies={tax}
              />
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-primary"
                  onClick={() => {
                    void saveCandidate(newCandidate);
                    setNewCandidate(null);
                  }}
                  disabled={busy || newCandidate.name.trim() === ""}
                >
                  Save profile
                </button>
                <button className="btn-ghost" onClick={() => setNewCandidate(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {cands.map((candidate) => (
            <div key={candidate.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{candidate.name}</p>
                  <p className="text-xs text-slate-400">
                    {candidate.headline} · {candidate.experienceYears} yr exp ·{" "}
                    {candidate.availabilityMonths} months available
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {candidate.skills.slice(0, 8).map((skill) => (
                      <span key={skill} className="chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      const next = expandedCandidate === candidate.id ? null : candidate.id;
                      setExpandedCandidate(next);
                      setCandidateDraft(next ? { ...candidate } : null);
                    }}
                  >
                    {expandedCandidate === candidate.id ? "Collapse" : "Edit"}
                  </button>
                  <button className="btn-danger" onClick={() => removeCandidate(candidate)}>
                    Delete
                  </button>
                </div>
              </div>

              {expandedCandidate === candidate.id && candidateDraft ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <CandidateFields
                    value={candidateDraft}
                    onChange={(next) => setCandidateDraft({ ...candidateDraft, ...next })}
                    taxonomies={tax}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => saveCandidate(candidateDraft)}
                      disabled={busy}
                    >
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setExpandedCandidate(null);
                        setCandidateDraft(null);
                      }}
                    >
                      Discard
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Nothing is written to the database until you save.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {tab === "data" ? (
        <section className="space-y-4">
          <div className="card card-pad text-sm text-slate-300">
            <h2 className="mb-2 text-sm font-semibold text-white">Export</h2>
            <p className="text-xs text-slate-400">
              Download the complete database (internships, candidates, option lists) as JSON. This
              also works as a backup before a redeploy, and as the source for an import.
            </p>
            <a className="btn-primary mt-3" href="/api/db" download>
              Download internship-compass-db.json
            </a>
            <p className="mt-2 text-xs text-slate-500">
              Equivalent API call: <code>GET /api/db</code>
            </p>
          </div>

          <div className="card card-pad text-sm text-slate-300">
            <h2 className="mb-2 text-sm font-semibold text-white">Import</h2>
            <p className="text-xs text-slate-400">
              Paste a previously exported JSON document. <strong>Merge</strong> updates internships
              with the same id and adds new ones; <strong>replace</strong> overwrites the
              collections completely.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                />
                Merge
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                />
                Replace
              </label>
            </div>
            <textarea
              className="input mt-3 min-h-[140px] font-mono text-xs"
              placeholder='{"version":1,"internships":[…],"candidates":[…]}'
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <button
              className="btn-primary mt-3"
              onClick={importDatabase}
              disabled={busy || importText.trim() === ""}
            >
              {busy ? "Importing…" : `Import (${importMode})`}
            </button>
          </div>

          <div className="card card-pad text-sm text-slate-300">
            <h2 className="mb-2 text-sm font-semibold text-white">Reset</h2>
            <p className="text-xs text-slate-400">
              Throw away every runtime edit and restore the seed data that ships with the repository
              ({rows.length} internships, {cands.length} candidates currently stored).
            </p>
            <button className="btn-danger mt-3" onClick={resetDatabase} disabled={busy}>
              Restore seed data
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Small editor for a taxonomy list: value + label rows plus an add row. */
function TermEditor({
  title,
  terms,
  onChange,
  placeholderValue,
  placeholderLabel,
}: {
  title: string;
  terms: { value: string; label: string }[];
  onChange: (terms: { value: string; label: string }[]) => void;
  placeholderValue: string;
  placeholderLabel: string;
}) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");

  const add = () => {
    const nextValue = value.trim();
    if (!nextValue) return;
    if (terms.some((term) => term.value.toLowerCase() === nextValue.toLowerCase())) return;
    onChange([...terms, { value: nextValue, label: label.trim() || nextValue }]);
    setValue("");
    setLabel("");
  };

  return (
    <div className="card card-pad">
      <h2 className="mb-3 text-sm font-semibold text-white">{title}</h2>
      <div className="space-y-2">
        {terms.map((term, index) => (
          <div key={`${term.value}-${index}`} className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-[16rem] font-mono text-xs"
              value={term.value}
              onChange={(event) => {
                const next = [...terms];
                next[index] = { ...term, value: event.target.value };
                onChange(next);
              }}
            />
            <input
              className="input max-w-[20rem]"
              value={term.label}
              onChange={(event) => {
                const next = [...terms];
                next[index] = { ...term, label: event.target.value };
                onChange(next);
              }}
            />
            <button
              className="btn-danger"
              onClick={() => onChange(terms.filter((_, position) => position !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <input
          className="input max-w-[16rem] font-mono text-xs"
          placeholder={placeholderValue}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
        />
        <input
          className="input max-w-[20rem]"
          placeholder={placeholderLabel}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
        />
        <button className="btn-ghost" onClick={add}>
          + Add
        </button>
      </div>
    </div>
  );
}
