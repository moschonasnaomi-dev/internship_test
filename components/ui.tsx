"use client";

import { useState } from "react";

import type { AiRunMeta, MatchResult } from "@/lib/types";
import { verdictClasses, verdictLabel } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "indigo" | "emerald" | "amber" | "rose" | "sky";
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/5 text-slate-300",
    indigo: "border-indigo-400/30 bg-indigo-500/15 text-indigo-200",
    emerald: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/15 text-amber-200",
    rose: "border-rose-400/30 bg-rose-500/15 text-rose-200",
    sky: "border-sky-400/30 bg-sky-500/15 text-sky-200",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ScoreRing({ score, size = 62 }: { score: number; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const colour =
    score >= 80 ? "#34d399" : score >= 65 ? "#38bdf8" : score >= 45 ? "#fbbf24" : "#fb7185";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-white">
        {score}
      </span>
    </div>
  );
}

export function ScoreBar({
  points,
  max,
  label,
  detail,
}: {
  points: number;
  max: number;
  label: string;
  detail?: string;
}) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  return (
    <div className="text-[11px]">
      <div className="flex items-center justify-between gap-2 text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {points}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      {detail ? <p className="mt-1 text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function VerdictBadge({ result }: { result: MatchResult }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${verdictClasses(
        result.verdict,
      )}`}
    >
      {verdictLabel(result.verdict)}
    </span>
  );
}

export function SourceTag({ result }: { result: MatchResult }) {
  const llm = result.source === "llm";
  return (
    <Badge tone={llm ? "indigo" : "amber"} title={result.model}>
      {llm ? `LLM · ${result.model}` : "local fallback scorer"}
    </Badge>
  );
}

export function ErrorNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
      {children}
    </p>
  );
}

/** Comma / enter separated list editor used for skills, tags, languages ... */
export function ListInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `suggestions-${label.replace(/[^a-zA-Z0-9]+/g, "-")}`;

  const add = (raw: string) => {
    const parts = raw
      .split(/[,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const part of parts) {
      if (!next.some((item) => item.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/60 p-2">
        {values.map((value) => (
          <span key={value} className="chip">
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              className="text-slate-400 hover:text-rose-300"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[7rem] flex-1 bg-transparent px-1 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          value={draft}
          placeholder={placeholder ?? "Type and press Enter"}
          list={listId}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
            if (event.key === "Backspace" && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Multi-select rendered as toggleable chips (used for types, locations ...). */
export function ChipPicker({
  label,
  options,
  selected,
  onChange,
  hint,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const isActive = (value: string) =>
    selected.some((item) => item.toLowerCase() === value.toLowerCase());

  const toggle = (value: string) => {
    onChange(
      isActive(value)
        ? selected.filter((item) => item.toLowerCase() !== value.toLowerCase())
        : [...selected, value],
    );
  };

  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <span className="text-xs text-slate-500">No options yet.</span>
        ) : null}
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`chip transition ${isActive(option.value) ? "chip-active" : "hover:bg-white/10"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function AiMetaPanel({ meta, extra }: { meta: AiRunMeta; extra?: React.ReactNode }) {
  return (
    <div className="card card-pad text-xs text-slate-400">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="indigo">
          {meta.auth === "api-key" ? "authenticated key" : "free anonymous tier"}
        </Badge>
        <Badge tone="neutral">{meta.model}</Badge>
        <Badge tone="neutral">
          {meta.llmScored} by LLM · {meta.fallbackScored} by fallback
        </Badge>
        <Badge tone="neutral">
          {meta.batches} request{meta.batches === 1 ? "" : "s"} ·{" "}
          {(meta.durationMs / 1000).toFixed(1)}s
        </Badge>
        {extra}
      </div>
      <p className="mt-2 break-all text-slate-500">{meta.endpoint}</p>
      {meta.notes.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-300/90">
          {meta.notes.slice(0, 4).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
