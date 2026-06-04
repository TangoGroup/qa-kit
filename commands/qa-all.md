---
description: Tiered full-QA sweep — run ALL qa-kit dimensions on demand, consolidate every dimension's findings into one deduped+ranked report, and best-effort ingest the union to the dashboard. `/qa-all` = full agentic sweep; `/qa-all fast` = deterministic dimensions only.
---

Run the qa-kit full-QA sweep. This is the on-demand "run everything" entry point: it fans out across the dimensions, writes every dimension's findings into one day-folder, then consolidates + ingests + reports the union.

> **Cost note:** the **full** tier is a large multi-agent run — it dispatches the agentic/LLM workflows (tenancy, persona-score, rbac-tournament) plus the AI visual eval, so it takes minutes and burns significant tokens. The **fast** tier is the cheap, deterministic subset (no LLM) and is the right default for a quick gate.

1. **Parse the arg.** If the argument is `fast` (case-insensitive), run the **fast tier** (deterministic dimensions only). Otherwise run the **full tier** (fast PLUS the agentic dimensions).

2. **Load config + mint the shared run identity.** Load `qa.config.ts` (`mod.default.default ?? mod.default`). Resolve `repoRoot` to the repo's absolute path if unset. Compute `date` = today as `YYYY-MM-DD` and a single shared `runId` = `qa-all-<YYYYMMDD-HHmmss>`. Determine the staging base URL from `cfg.envs.staging.baseUrl`. Stringify the resolved config to JSON once (`<cfg>`) for the bins.

3. **Run the dimensions.** Every dimension writes its `Finding[]` into the SAME day folder `cfg.findings.dir/<date>/`, each tagged with a **per-dimension runId derived from the shared runId** (`<runId>-rbac`, `<runId>-a11y`, `<runId>-tenancy`, …) so step 4's `qa-report` picks them all up. **Each dimension is best-effort: if one fails, log the error and continue — a full sweep must not abort on a single dimension.**

   **Fast tier (deterministic — BOTH tiers run these):**
   - **rbac lattice:** `pnpm exec tsx <qa-kit>/bin/qa-rbac.mjs '<cfg>' '<absolute oracle path from cfg.rbac.fieldVisibility>' '<cfg.findings.dir>' '<runId>-rbac' '<date>'`. (Requires `cfg.rbac.fieldVisibility` + `cfg.rbac.roles`/`personas.matrix`; if absent, skip with a logged note.)
   - **a11y:** run the a11y audit per `/qa-a11y` (run the audit spec against staging, then `auditFindingsToFindings`), writing to `<cfg.findings.dir>/<date>/<runId>-a11y.json` via `writeFindings(cfg.findings.dir, { date, runId: "<runId>-a11y" }, findings)`. If staging or Playwright isn't available, skip with a logged note.
   - **deploy-gate bundle-truth:** if a deployed URL + expected SHA are available (e.g. the staging alias + `git rev-parse HEAD`), `pnpm exec tsx <qa-kit>/bin/qa-deploy-gate.mjs '<cfg>' '<url>' '<expectedSha>' '<cfg.findings.dir>' '<runId>-deploy' '<date>'`. If there's no deployed target, skip with a logged note.

   **Full tier (the fast dimensions above PLUS the agentic/LLM dimensions):**
   - **tenancy:** `Workflow({ name: "qa-tenancy", args: <cfg> })` → map the returned verdicts with `verdictsToFindings({ app: cfg.app.name, runId: "<runId>-tenancy", date, verdicts })` → `writeFindings(cfg.findings.dir, { date, runId: "<runId>-tenancy" }, findings)`.
   - **persona-score:** `Workflow({ name: "qa-persona-score", args: <cfg> })` → map per `/qa-persona-score` (one scored Finding per persona×dimension via `evalResultToScoredFinding`) → `writeFindings(..., { date, runId: "<runId>-persona" }, findings)`.
   - **rbac-tournament:** `Workflow({ name: "qa-rbac-tournament", args: <cfg> })` → map each verdict → Finding (dimension `rbac`, `verifiedBy: "tournament"`) → `writeFindings(..., { date, runId: "<runId>-rbac-tournament" }, findings)`.
   - **visual-eval:** run `/qa-visual-eval` (the `<qa-kit>/bin/qa-visual-eval.mjs` AI eval), writing `<runId>-visual` — i.e. pass `'<runId>-visual'` as the runId argument so the file lands at `<cfg.findings.dir>/<date>/<runId>-visual.json`.

4. **Consolidate + ingest + report.** `pnpm exec tsx <qa-kit>/bin/qa-report.mjs '<cfg>' '<cfg.findings.dir>' '<date>'`. This reads every `<runId>-*.json` written above, dedupes + ranks the union, prints the consolidated cross-dimension report (totals line, per-dimension×severity table, ranked critical/high titles with file/route), and **best-effort** ingests the deduped union to the dashboard (gated on `QA_DASHBOARD_SUPABASE_URL` + `QA_DASHBOARD_SERVICE_KEY`; if unset it skips silently and never fails).

5. **Print the run summary.** State the tier that ran (full vs fast) and which dimensions ran vs were skipped (with the reason for each skip), the findings path (`cfg.findings.dir/<date>/`), and the dashboard note (whether the union was ingested or ingest was skipped because the `QA_DASHBOARD_*` env wasn't set).

Do not modify application code. This command only audits, records, and reports.
