---
description: Run the cross-tenant IDOR audit for this app and write findings.
---

Run the qa-kit tenancy audit against the current repo:

1. Load the app's `qa.config.ts` from the repo root. Resolve `repoRoot` to the
   absolute path of the repo if unset. Call `defineQAConfig` to validate it.
2. Invoke the workflow: `Workflow({ name: "qa-tenancy", args: <resolved config> })`.
   Wait for it to complete and read the returned
   `{ candidateCount, suspects, verdicts, report }` (the workflow does not return
   a `runId` — you mint that in step 3).
3. Compute `date` = today as `YYYY-MM-DD` and `runId` =
   `qa-tenancy-<YYYYMMDD-HHmmss>` (you generate these yourself — do not expect them
   from the workflow). Import the helpers from the installed `qa-kit` package (the
   plugin exposes `qa-kit/core`). Map the verdicts to findings with
   `verdictsToFindings({ app: cfg.app.name, runId, date, verdicts })`, then
   `writeFindings(cfg.findings.dir, { date, runId }, findings)`.
4. Print a ranked summary (critical→low) and the path to the written findings file.
   For each confirmed finding, show file:line, the two-tenant repro, and the fix.

Do not modify application code. This command only audits and records.
