/**
 * End-to-end smoke test for a running Internship Compass server.
 *
 *   npm run build && npm start      # in one terminal
 *   npm run smoke                   # in another
 *
 * Point it somewhere else with SMOKE_BASE_URL, e.g.
 *   SMOKE_BASE_URL=https://my-app.vercel.app npm run smoke
 *
 * Exit code 0 = every check passed, 1 = at least one failure.
 */
const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

let failures = 0;
const results = [];

function record(ok, line) {
  if (!ok) failures += 1;
  results.push(`${ok ? "ok  " : "FAIL"}  ${line}`);
}

async function request(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

const json = (method, payload) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // 1. Pages and read-only endpoints.
  const readPaths = [
    "/",
    "/manage",
    "/recruit",
    "/about",
    "/api/internships",
    "/api/taxonomies",
    "/api/candidates",
    "/api/db",
    "/api/ai/match",
  ];
  for (const path of readPaths) {
    try {
      const { status } = await request(path);
      record(status === 200, `GET ${path} -> ${status}`);
    } catch (error) {
      record(false, `GET ${path} -> ${error.message}`);
    }
  }

  // 2. Internship CRUD (create, patch, delete).
  const created = await request(
    "/api/internships",
    json("POST", {
      title: "Smoke test role",
      company: "QA BV",
      type: "devshop",
      location: "Hasselt",
      country: "Belgium",
      workMode: "hybrid",
      level: "bachelor",
      durationMonths: 3,
      hoursPerWeek: 32,
      skills: ["Testing"],
      requirements: ["Enrolled student"],
      description: "Temporary vacancy created by the smoke test.",
      status: "open",
    }),
  );
  const internshipId = created.body?.internship?.id;
  record(Boolean(internshipId), `POST /api/internships -> id=${internshipId || "none"}`);

  if (internshipId) {
    const patched = await request(
      `/api/internships/${internshipId}`,
      json("PATCH", { status: "closed" }),
    );
    record(
      patched.status === 200 && patched.body?.internship?.status === "closed",
      `PATCH /api/internships/${internshipId} -> ${patched.status}`,
    );
    const removed = await request(`/api/internships/${internshipId}`, { method: "DELETE" });
    record(removed.status === 200, `DELETE /api/internships/${internshipId} -> ${removed.status}`);
  }

  // 3. Candidate CRUD.
  const candidate = await request(
    "/api/candidates",
    json("POST", {
      name: "Smoke Candidate",
      headline: "Test student",
      education: "Bachelor",
      experienceYears: 0,
      experienceSummary: "",
      skills: ["JavaScript"],
      languages: ["Dutch"],
      preferredTypes: ["devshop"],
      preferredLocations: ["Limburg"],
      preferredWorkModes: ["hybrid"],
      availabilityMonths: 4,
      hoursPerWeek: 20,
      portfolioUrl: "",
      notes: "",
    }),
  );
  const candidateId = candidate.body?.candidate?.id;
  record(Boolean(candidateId), `POST /api/candidates -> id=${candidateId || "none"}`);
  if (candidateId) {
    const removed = await request(`/api/candidates/${candidateId}`, { method: "DELETE" });
    record(removed.status === 200, `DELETE /api/candidates/${candidateId} -> ${removed.status}`);
  }

  // 4. AI flows. These hit the free Pollinations API, so they get a long timeout.
  const { internships } = (await request("/api/internships")).body || {};
  const { candidates } = (await request("/api/candidates")).body || {};
  const internship = internships?.[0];
  const [firstCandidate, secondCandidate] = candidates || [];

  if (internship && firstCandidate) {
    const match = await request(
      "/api/ai/match",
      json("POST", { candidateId: firstCandidate.id, internshipIds: (internships || []).slice(0, 3).map((i) => i.id) }),
    );
    const meta = match.body?.meta;
    record(
      match.status === 200 && Array.isArray(match.body?.results) && match.body.results.length > 0,
      `POST /api/ai/match -> ${match.status} (${match.body?.results?.length ?? 0} results, ${
        meta?.llmScored ?? 0
      } from the model)`,
    );
  } else {
    record(false, "POST /api/ai/match -> no seeded data to test with");
  }

  if (internship && firstCandidate && secondCandidate) {
    const rank = await request(
      "/api/ai/candidates",
      json("POST", {
        internshipId: internship.id,
        candidateIds: [firstCandidate.id, secondCandidate.id],
      }),
    );
    const meta = rank.body?.meta;
    record(
      rank.status === 200 && Array.isArray(rank.body?.results) && rank.body.results.length === 2,
      `POST /api/ai/candidates -> ${rank.status} (${meta?.llmScored ?? 0}/2 from the model${
        meta?.notes?.length ? `; notes: ${meta.notes.join(" | ")}` : ""
      })`,
    );
  }

  const draft = await request(
    "/api/ai/draft",
    json("POST", {
      title: "Full-stack developer",
      company: "Studio Hex",
      type: "devshop",
      location: "Limburg",
      country: "Belgium",
      workMode: "hybrid",
      level: "bachelor",
      durationMonths: 3,
      skills: ["TypeScript", "React"],
      notes: "",
    }),
  );
  record(
    draft.status === 200 && Boolean(draft.body?.draft?.description),
    `POST /api/ai/draft -> ${draft.status} (${draft.body?.draft?.source || "no source"})`,
  );

  // 5. Reset, so a local run never keeps smoke-test rows.
  const reset = await request("/api/db", { method: "DELETE" });
  record(reset.status === 200, `DELETE /api/db -> ${reset.status}`);

  console.log(results.join("\n"));
  console.log(
    `\n${results.length - failures}/${results.length} checks passed` +
      (failures ? `, ${failures} FAILED` : ""),
  );
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(`Smoke test crashed: ${error.message}`);
  process.exit(1);
});
