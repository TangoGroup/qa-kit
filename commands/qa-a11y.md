---
description: Run the mobile-UI/a11y audit and write a11y findings.
---

Run the qa-kit a11y audit:

1. Load `qa.config.ts` (`mod.default.default ?? mod.default`). Read `rubrics.a11y` (`minTapTargetPx`, `blockOn`).
2. Run the audit spec against the app's pages — either copy `<qa-kit>/assets/a11y-audit.spec.ts` into the app's e2e dir and run it via Playwright, or run the app's existing audit. Set `QA_A11Y_MIN_TAP=<minTapTargetPx>` and `QA_A11Y_ROUTES=<json>`; it writes `AuditFinding[]` JSON per route under `reports/audit`.
3. Compute `date` + `runId` (`qa-a11y-<YYYYMMDD-HHmmss>`). Read all `reports/audit/**/*.json`, concat into one `AuditFinding[]`.
4. Map with `auditFindingsToFindings({ app: cfg.app.name, runId, date, blockOn: cfg.rubrics.a11y.blockOn, audit })` from `qa-kit/evals`, then `writeFindings(cfg.findings.dir, { date, runId }, findings)` from `qa-kit/core`.
5. Print findings grouped by severity × kind.

Do not modify application code.
