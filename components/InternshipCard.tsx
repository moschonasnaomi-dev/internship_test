"use client";

import { useState } from "react";

import { overlapSignal } from "@/lib/overlap";
import type { CandidateDraft, Internship, MatchResult, Taxonomies } from "@/lib/types";
import { formatDate, labelFrom } from "@/lib/utils";

import { Badge, ScoreBar, ScoreRing, SourceTag, VerdictBadge } from "./ui";

const workModeLabel: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

/**
 * One internship, with an optional AI match overlay.
 * `candidateForSignal` enables the deterministic local overlap breakdown so the
 * user can see *why* a score came out the way it did.
 */
export function InternshipCard({
  internship,
  taxonomies,
  result,
  candidateForSignal,
  actions,
  defaultOpen = false,
}: {
  internship: Internship;
  taxonomies: Taxonomies;
  result?: MatchResult | null;
  candidateForSignal?: CandidateDraft | null;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const signal = candidateForSignal ? overlapSignal(candidateForSignal, internship) : null;

  return (
    <article className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{labelFrom(taxonomies.types, internship.type)}</Badge>
            <Badge tone="neutral">📍 {labelFrom(taxonomies.locations, internship.location)}</Badge>
            <Badge tone="neutral">{workModeLabel[internship.workMode] ?? internship.workMode}</Badge>
            <Badge
              tone={
                internship.status === "open"
                  ? "emerald"
                  : internship.status === "draft"
                    ? "amber"
                    : "rose"
              }
            >
              {internship.status}
            </Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold text-white">{internship.title}</h3>
          <p className="text-sm text-slate-400">
            {internship.company || "—"} · {internship.durationMonths} months ·{" "}
            {internship.hoursPerWeek}h/week ·{" "}
            {internship.stipendEurPerMonth !== null
              ? `€${internship.stipendEurPerMonth}/month`
              : "unpaid"}
          </p>
        </div>

        {result ? (
          <div className="flex items-center gap-3">
            <ScoreRing score={result.score} />
            <div className="space-y-1">
              <VerdictBadge result={result} />
              <div>
                <SourceTag result={result} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.07] p-3 text-xs">
          <p className="text-slate-200">{result.rationale}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                Matched
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-300">
                {result.matched.length === 0 ? <li>—</li> : null}
                {result.matched.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                Gaps to address
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-300">
                {result.gaps.length === 0 ? <li>—</li> : null}
                {result.gaps.map((item) => (
                  <li key={item}>! {item}</li>
                ))}
              </ul>
            </div>
          </div>
          {result.interviewQuestions.length > 0 ? (
            <div className="mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
                Questions to ask
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-300">
                {result.interviewQuestions.map((item) => (
                  <li key={item}>? {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        {open || internship.description.length <= 200
          ? internship.description
          : `${internship.description.slice(0, 200)}…`}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {internship.skills.map((skill) => (
          <span key={skill} className="chip">
            {skill}
          </span>
        ))}
        {internship.tags.map((tag) => (
          <span key={tag} className="chip opacity-70">
            #{tag}
          </span>
        ))}
      </div>

      {open ? (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <div>
            <p className="field-label">You will</p>
            <ul className="space-y-1 text-sm text-slate-300">
              {internship.responsibilities.length === 0 ? <li>—</li> : null}
              {internship.responsibilities.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="field-label">Requirements</p>
            <ul className="space-y-1 text-sm text-slate-300">
              {internship.requirements.length === 0 ? <li>—</li> : null}
              {internship.requirements.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          {signal ? (
            <div className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
              {signal.breakdown.map((item) => (
                <ScoreBar
                  key={item.label}
                  label={item.label}
                  points={item.points}
                  max={item.max}
                  detail={item.detail}
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4 text-xs text-slate-400 sm:col-span-2">
            <span>Starts {formatDate(internship.startDate)}</span>
            <span>Apply before {formatDate(internship.applicationDeadline)}</span>
            <span>Level: {internship.level}</span>
            <span>Languages: {internship.languages.join(", ") || "—"}</span>
            {internship.perks.length > 0 ? (
              <span>Perks: {internship.perks.join(", ")}</span>
            ) : null}
          </div>
          {internship.contactEmail || internship.url ? (
            <div className="flex flex-wrap gap-4 text-xs sm:col-span-2">
              {internship.contactEmail ? (
                <a
                  className="text-indigo-300 hover:underline"
                  href={`mailto:${internship.contactEmail}`}
                >
                  {internship.contactEmail}
                </a>
              ) : null}
              {internship.url ? (
                <a
                  className="text-indigo-300 hover:underline"
                  href={internship.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {internship.url} ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <button type="button" className="btn-ghost" onClick={() => setOpen((value) => !value)}>
          {open ? "Show less" : "Show details"}
        </button>
        {actions}
      </div>
    </article>
  );
}
