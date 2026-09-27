"use client";

import { useMemo, useState } from "react";

import type {
  AiRunMeta,
  CandidateProfile,
  Internship,
  MatchResult,
  Taxonomies,
} from "@/lib/types";
import { labelFrom } from "@/lib/utils";

import { AiMetaPanel, Badge, ErrorNote, ScoreRing, SourceTag, VerdictBadge } from "./ui";

/**
 * Recruiter view: pick one internship, pick the applicant profiles, and let the
 * free Pollinations LLM rank them with a rationale and interview questions.
 */
export function RecruitClient({
  internships,
  candidates,
  taxonomies,
}: {
  internships: Internship[];
  candidates: CandidateProfile[];
  taxonomies: Taxonomies;
}) {
  const openInternships = useMemo(
    () =>
      internships
        .filter((internship) => internship.status !== "closed")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [internships],
  );

  const [internshipId, setInternshipId] = useState(openInternships[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>(candidates.map((item) => item.id));
  const [results, setResults] = useState<MatchResult[]>([]);
  const [meta, setMeta] = useState<AiRunMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const internship = openInternships.find((item) => item.id === internshipId) ?? null;

  const toggleCandidate = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  async function rank() {
    if (!internship) {
      setError("Pick an internship first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ai/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internshipId: internship.id, candidateIds: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || payload?.error || "Ranking failed");
      setResults(payload.results as MatchResult[]);
      setMeta(payload.meta as AiRunMeta);
      setNotice(`Ranked ${payload.results.length} candidates for "${internship.title}".`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="card card-pad">
        <h1 className="text-2xl font-bold text-white">Rank candidates for a vacancy</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          The same free Pollinations LLM that scores internships for students can rank applicants for
          one internship, using a 45/20/15/10/10 rubric (skills, seniority, practical fit, location,
          motivation) and returning three interview questions per candidate.
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="card card-pad text-sm text-slate-300">
          No candidate profiles stored yet. Create some on the{" "}
          <a className="text-indigo-300 hover:underline" href="/manage">
            Manage internships
          </a>{" "}
          page, or save your own profile from the home page.
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Vacancy
          </h2>
          <select
            className="input"
            value={internshipId}
            onChange={(event) => setInternshipId(event.target.value)}
          >
            {openInternships.length === 0 ? <option value="">No open internships</option> : null}
            {openInternships.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} — {item.company}
              </option>
            ))}
          </select>

          {internship ? (
            <div className="mt-4 space-y-2 text-xs text-slate-300">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="indigo">{labelFrom(taxonomies.types, internship.type)}</Badge>
                <Badge tone="neutral">
                  📍 {labelFrom(taxonomies.locations, internship.location)}
                </Badge>
                <Badge tone="neutral">{internship.workMode}</Badge>
                <Badge tone="neutral">{internship.level}</Badge>
              </div>
              <p>{internship.description.slice(0, 260)}…</p>
              <p className="text-slate-400">Needs: {internship.skills.join(", ") || "—"}</p>
            </div>
          ) : null}
        </div>

        <div className="card card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Candidates ({selected.length}/{candidates.length} selected)
          </h2>
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <label
                key={candidate.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(candidate.id)}
                  onChange={() => toggleCandidate(candidate.id)}
                />
                <span>
                  <span className="block text-sm font-medium text-white">{candidate.name}</span>
                  <span className="block text-xs text-slate-400">
                    {candidate.headline} · {candidate.availabilityMonths} months ·{" "}
                    {candidate.hoursPerWeek}h/week
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {candidate.skills.slice(0, 6).join(" · ") || "no skills listed"}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-ai" onClick={rank} disabled={busy || selected.length === 0}>
              {busy ? "Ranking…" : `Rank ${selected.length} candidates with AI`}
            </button>
            <button
              className="btn-ghost"
              onClick={() => setSelected(candidates.map((item) => item.id))}
            >
              Select all
            </button>
            <button className="btn-ghost" onClick={() => setSelected([])}>
              Select none
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <ErrorNote>{error}</ErrorNote>
            {notice ? (
              <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {notice}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {meta ? <AiMetaPanel meta={meta} /> : null}

      {results.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Ranking ({results.length} candidates)
          </h2>
          {results.map((result, index) => (
            <article key={result.targetId} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                    #{index + 1}
                  </p>
                  <h3 className="text-base font-semibold text-white">{result.targetLabel}</h3>
                  <p className="text-sm text-slate-400">{result.secondaryLabel}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VerdictBadge result={result} />
                    <SourceTag result={result} />
                  </div>
                </div>
                <ScoreRing score={result.score} />
              </div>

              <p className="mt-3 text-sm text-slate-200">{result.rationale}</p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                    Strengths
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                    {result.matched.length === 0 ? <li>—</li> : null}
                    {result.matched.map((item) => (
                      <li key={item}>✓ {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                    Gaps / risks
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                    {result.gaps.length === 0 ? <li>—</li> : null}
                    {result.gaps.map((item) => (
                      <li key={item}>! {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {result.interviewQuestions.length > 0 ? (
                <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
                    Interview questions
                  </p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-slate-200">
                    {result.interviewQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </article>
          ))}
          <p className="text-xs text-slate-500">
            Rankings are generated by an LLM and must be reviewed by a human. Do not use them as an
            automated rejection mechanism.
          </p>
        </section>
      ) : null}
    </div>
  );
}
