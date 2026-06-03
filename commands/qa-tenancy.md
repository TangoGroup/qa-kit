---
description: Run the cross-tenant IDOR audit for this app and write findings.
---

Run the qa-kit tenancy audit against the current repo:

1. Load the app's `qa.config.ts` from the repo root. Resolve `repoRoot` to the
   absolute path of the repo if unset. Call `defineQAConfig` to validate it.
2. Invoke the workflow: `Workflow({ name: "qa-tenancy", args: <resolved config> })`.
   Wait for it to complete and read the returned `{ verdicts, report }`.
3. Map the verdicts to findings with `verdictsToFindings({ app: cfg.app.name,
   runId: <the workflow runId>, date: <today YYYY-MM-DD>, verdicts })` from
   `qa-kit/core`, then `writeFindings(cfg.findings.dir, { date, runId }, findings)`.
4. Print a ranked summary (critical→low) and the path to the written findings file.
   For each confirmed finding, show file:line, the two-tenant repro, and the fix.

Do not modify application code. This command only audits and records.
