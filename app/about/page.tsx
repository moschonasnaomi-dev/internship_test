import Link from "next/link";

import { pollinationsConfig } from "@/lib/pollinations";
import { getStorageInfo, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How it works — Internship Compass",
};

export default async function AboutPage() {
  const db = await readDb();
  const storage = getStorageInfo();
  const config = pollinationsConfig();

  return (
    <div className="space-y-6">
      <header className="card card-pad">
        <h1 className="text-2xl font-bold text-white">How Internship Compass works</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          A Next.js app you can run locally or deploy on Vercel. Internships are fully editable, and
          candidate matching is done by the free LLM from{" "}
          <a
            className="text-indigo-300 hover:underline"
            href="https://pollinations.ai"
            target="_blank"
            rel="noreferrer"
          >
            Pollinations.ai
          </a>
          . No paid API key is required.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad text-sm text-slate-300">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
            1 · Editable internship board
          </h2>
          <p>
            Every field of an internship is editable: title, company, <strong>type</strong> (devshop,
            corporate, startup, government, research, NGO...), <strong>location</strong> (Limburg,
            Limburg – Hasselt, Brussels, remote...), work mode, level, duration, hours, stipend,
            deadlines, skills, languages, tags, responsibilities, requirements and the application
            link.
          </p>
          <p className="mt-2">
            Dropdown values come from editable option lists. Add a new type or location in{" "}
            <Link className="text-indigo-300 hover:underline" href="/manage">
              Manage internships → Option lists
            </Link>
            , or just type a new value into the field: it is stored and added to the list
            automatically.
          </p>
        </div>

        <div className="card card-pad text-sm text-slate-300">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
            2 · Free LLM evaluation (Pollinations.ai)
          </h2>
          <p>
            The server posts a compact JSON payload to the OpenAI-compatible Pollinations text
            endpoint with <code className="text-indigo-200">response_format: json_object</code> and
            asks for a strict schema back. Answers that do not parse are discarded, scores are
            clamped, and verdicts are re-derived from the score so a label can never contradict the
            number.
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <strong>Candidate → internships:</strong> one scorecard per vacancy, sorted best
              first, with matched skills, gaps and a short rationale.
            </li>
            <li>
              <strong>Internship → candidates:</strong> a ranking of applicants plus three tailored
              interview questions each.
            </li>
            <li>
              <strong>Draft with AI:</strong> generate the description, responsibilities,
              requirements, tags and skills of a vacancy.
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Active endpoint: <code className="text-indigo-200">{config.endpoint}</code>
            <br />
            Model: <code className="text-indigo-200">{config.model}</code> · auth:{" "}
            {config.auth === "api-key" ? "your POLLINATIONS_API_KEY" : "free anonymous tier"}
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad text-sm text-slate-300">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
            3 · Deterministic fallback, so it never breaks
          </h2>
          <p>
            Before any network call, a local overlap check computes an explainable score out of 100:
            skills &amp; domain 40, internship type 15, location/work mode 15, seniority 15 and
            practical fit (hours, availability, shared languages) 15. That breakdown is shown in the
            UI, handed to the model as extra signal, and used as the fallback whenever the model is
            unreachable. Every result is labelled <em>LLM</em> or{" "}
            <em>local fallback scorer</em>, so you always know which engine produced a number.
          </p>
          <p className="mt-2">
            Models can be wrong and can carry bias. Treat the scores as a conversation starter, not
            as an automated rejection tool.
          </p>
        </div>

        <div className="card card-pad text-sm text-slate-300">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-200">
            4 · Where your edits are stored
          </h2>
          <p>
            Current mode: <strong>{storage.mode}</strong> — {storage.location}. {storage.note}
          </p>
          <p className="mt-2">
            On Vercel the filesystem is read-only except for <code>/tmp</code>, which is per-instance
            and lost on a cold start. For permanent storage add the Upstash Redis integration from
            the Vercel Marketplace; the app detects{" "}
            <code className="text-indigo-200">KV_REST_API_URL</code> and{" "}
            <code className="text-indigo-200">KV_REST_API_TOKEN</code> automatically. You can also
            export and import the whole database as JSON from the Manage page.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            The database currently holds {db.internships.length} internships and{" "}
            {db.candidates.length} candidate profiles.
          </p>
        </div>
      </section>

      <section className="card card-pad text-sm text-slate-300">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
          API reference (useful for integrations)
        </h2>
        <ul className="space-y-1 text-xs">
          <li>
            <code className="text-indigo-200">GET /api/internships</code> — list, with optional
            filters <code>q, type, location, status, workMode, skill</code>
          </li>
          <li>
            <code className="text-indigo-200">POST /api/internships</code> ·{" "}
            <code className="text-indigo-200">PUT|PATCH|DELETE /api/internships/:id</code> — full
            CRUD
          </li>
          <li>
            <code className="text-indigo-200">GET|PUT /api/taxonomies</code> — the editable option
            lists
          </li>
          <li>
            <code className="text-indigo-200">GET|POST /api/candidates</code> ·{" "}
            <code className="text-indigo-200">PUT|DELETE /api/candidates/:id</code>
          </li>
          <li>
            <code className="text-indigo-200">POST /api/ai/match</code> — score one candidate
            against many internships
          </li>
          <li>
            <code className="text-indigo-200">POST /api/ai/candidates</code> — rank candidates for
            one internship
          </li>
          <li>
            <code className="text-indigo-200">POST /api/ai/draft</code> — draft a vacancy with the
            LLM
          </li>
          <li>
            <code className="text-indigo-200">GET /api/ai/match</code> — Pollinations connectivity
            probe
          </li>
          <li>
            <code className="text-indigo-200">GET|POST|DELETE /api/db</code> — export, import, reset
            the database
          </li>
        </ul>
      </section>
    </div>
  );
}
