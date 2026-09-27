# Internship Compass

An online internship board where **every internship field is editable**
(`type: devshop`, `location: Limburg`, skills, stipend, deadlines, ...) and candidates are
**evaluated by a free LLM** (Pollinations.ai). Ships as a Next.js app that deploys to Vercel.

```
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Pollinations.ai text API · Vercel
```

---

## What it does

| Page | Purpose |
| --- | --- |
| `/` | Fill in a student profile → the free Pollinations LLM scores every internship (0-100 + verdict + matched skills + gaps + rationale). Filter/sort the board by type, location, work mode, status, stipend. |
| `/manage` | Full CRUD on internships, editor for the option lists behind every dropdown (types, locations, skills, languages), candidate profile management, JSON import/export/reset. |
| `/recruit` | Recruiter view: pick one internship, rank the stored applicants, get strengths, risks and 3 tailored interview questions per candidate. |
| `/about` | How the matching works, which endpoint/model is active, where data is stored, API reference. |

### The "editable internships" part

* All fields of an internship are editable in `/manage`: title, company, **type**, **location**,
  country, work mode, level, status, duration, hours, stipend, start date, deadline, skills,
  languages, tags, description, responsibilities, requirements, perks, contact and URL.
* `type` and `location` are free-text inputs backed by an **editable taxonomy**, so you can add
  `devshop`, `corporate`, `Limburg`, `Maastricht`, ... Values that exist on an internship but were
  removed from the list are automatically re-added, so nothing breaks.
* Option lists are edited at `/manage → Option lists` (`GET|PUT /api/taxonomies`).

### The "thinky brain" (LLM) part

The server calls the **free, keyless** Pollinations endpoint:

```
POST https://text.pollinations.ai/openai
{ "model": "openai-fast", "response_format": {"type":"json_object"}, "messages": [...], "seed": … }
```

* Model output is JSON-parsed defensively (`extractJson`), scores are clamped to 0-100 and the
  verdict is re-derived from the score, so labels can never contradict numbers.
* Requests are batched (5 internships / candidates per call) with retries, timeouts and a delay
  between batches, so a single failure only costs one batch.
* A **deterministic local overlap check** (`lib/overlap.ts`, weights 40/15/15/15/15) is computed
  first. It is (a) shown as a breakdown in the UI, (b) sent to the model as extra signal, and
  (c) used as the fallback whenever the model is unreachable. Each result is labelled **LLM** or
  **local fallback scorer**, and the run panel reports model, endpoint, auth mode, batching and
  timing.
* `POST /api/ai/draft` generates a vacancy description, responsibilities, requirements, tags and
  skills ("✨ Draft with AI" in the internship editor).

---

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are required: the anonymous Pollinations tier needs no API key.
Useful scripts: `npm run build`, `npm run start`, `npm run typecheck`, `npm run smoke`.

## Environment variables (all optional)

Copy `.env.example` to `.env.local` if you want any of these:

| Variable | Effect |
| --- | --- |
| `POLLINATIONS_API_KEY` | Switches to `https://gen.pollinations.ai/v1/chat/completions` for higher rate limits. |
| `POLLINATIONS_TEXT_URL` | Use a different text endpoint. |
| `POLLINATIONS_MODEL` | Override the model (default `openai-fast`, or `openai` with a key). |
| `POLLINATIONS_REFERRER` | Value sent as the `referrer` query parameter. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Optional Upstash/Vercel KV REST credentials for durable storage. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternative names for the same thing. |
| `ALLOW_HEURISTIC_FALLBACK=false` | Fail the request instead of falling back to the local scorer. |

---

## Data storage — please read

The store (`lib/store.ts`) resolves a backend at runtime and **reports it honestly in the UI**:

1. **`kv`** — Upstash Redis / Vercel KV REST API. Durable. Used automatically when the marketplace
   integration injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`.
2. **`file`** — a JSON document on disk. Locally that is `data/db.local.json` (git-ignored) and edits
   survive restarts. On Vercel it is `/tmp/internship-compass-db.json`.
3. **`memory`** — last-resort fallback if nothing is writable.

> ⚠️ **On Vercel, `/tmp` is per-instance and ephemeral.** Edits made without a KV store survive only
> until that instance is recycled or a new deployment is created. The UI shows an amber banner when
> this is the case, and the Manage page lets you **export the whole database as JSON** at any time.
> Add **Storage → Marketplace → Upstash Redis** to the project to make edits permanent, then
> redeploy — no code change needed.

The bundled seed data (`data/internships.json`, `data/candidates.json`, `data/taxonomies.json`) is
never mutated, so `DELETE /api/db` always restores a clean starting point.

---

## Deploy to Vercel

### Option A — CLI (fastest)

```bash
npm i -g vercel        # or: npx vercel
vercel login           # one-time, interactive browser login
vercel                 # preview deployment
vercel --prod          # production deployment
```

### Option B — Git integration

```bash
git add .
git commit -m "Internship Compass"
git push
```

Then import the repository at <https://vercel.com/new>. Vercel detects Next.js automatically; keep
the default build command (`next build`) and leave the environment variables empty for the
zero-config, keyless mode.

### After the first deployment (recommended)

1. **Storage → Marketplace → Upstash Redis** → connect it to the project. Redeploy. The storage
   banner turns green ("durable").
2. Optional: add `POLLINATIONS_API_KEY` (from <https://enter.pollinations.ai/keys>, starts with
   `sk_`) under *Settings → Environment Variables* for higher rate limits. Never commit that key.
3. Optional: set `POLLINATIONS_REFERRER` to your deployment hostname.

`vercel.json` pins the function region to `fra1` (Frankfurt, closest to the Belgian/Dutch audience)
and forbids caching on `/api/*`.

---

## API

| Method + path | Description |
| --- | --- |
| `GET /api/internships?q=&type=&location=&status=&workMode=&skill=` | List internships (returns the taxonomies too). |
| `POST /api/internships` | Create one internship. |
| `PUT`/`PATCH`/`DELETE /api/internships/:id` | Update (full or partial) or delete one internship. |
| `GET`/`PUT /api/taxonomies` | Read or replace the editable option lists. |
| `GET`/`POST /api/candidates` | List or create candidate profiles. |
| `PUT`/`PATCH`/`DELETE /api/candidates/:id` | Update or delete a candidate profile. |
| `POST /api/ai/match` | `{ candidate \| candidateId, internshipIds?, includeClosed? }` → scored internships, best first. |
| `POST /api/ai/candidates` | `{ internshipId, candidateIds? \| candidates? }` → ranked applicants + interview questions. |
| `POST /api/ai/draft` | `{ title, company, type, location, ... }` → draft vacancy text. |
| `GET /api/ai/match` | Pollinations connectivity probe (model, endpoint, auth, latency). |
| `GET`/`POST`/`DELETE /api/db` | Export, import (`?mode=merge\|replace`) or reset the database. |

Example:

```bash
curl -s -X POST http://localhost:3000/api/ai/match \
  -H "Content-Type: application/json" \
  -d '{"candidate":{"name":"Lotte","skills":["TypeScript","React"],"preferredTypes":["devshop"],
       "preferredLocations":["Limburg"],"preferredWorkModes":["hybrid"],"availabilityMonths":5,
       "hoursPerWeek":38,"languages":["Dutch","English"]}}' | head -c 800
```

---

## Project layout

```
app/
  page.tsx                     Find my internship (server component)
  manage/page.tsx              Internship + taxonomy + candidate admin
  recruit/page.tsx             Rank applicants for one vacancy
  about/page.tsx               How it works
  api/…                        Route handlers (CRUD, taxonomy, AI, db)
components/
  Explorer.tsx                 Filters + AI matching workspace
  InternshipCard.tsx           Card + score overlay + local breakdown
  InternshipForm.tsx           Full internship editor (+ Draft with AI)
  ManageClient.tsx             Tabs: internships / option lists / candidates / data
  RecruitClient.tsx            Candidate ranking
  CandidateFields.tsx          Reusable candidate profile form
  StorageBanner.tsx            Honest storage-mode banner
  ui.tsx                       Badges, score ring/bar, list input, chip picker
lib/
  types.ts                     Domain types
  overlap.ts                   Deterministic, explainable overlap scorer
  evaluate.ts                  LLM prompts, batching, validation, fallbacks
  pollinations.ts              Pollinations client (JSON mode, retries)
  store.ts                     KV / file / memory persistence
  schema.ts                    Input normalisation + validation
  seed.ts, forms.ts, utils.ts  Helpers
data/                          Editable seed data (internships, candidates, taxonomies)
```

## Responsible use

Scores come from a small open model and a fixed rubric. They can be wrong, and they can reproduce
bias present in the data you feed them. Use them to structure a conversation and to save reading
time — never as an automated rejection mechanism, and never on data you are not allowed to send to a
third-party API.
