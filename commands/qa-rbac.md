---
description: RBAC check — deterministic oracle lattice + live role-pair tournament; writes rbac findings.
---

Run the qa-kit RBAC checks:

1. Load `qa.config.ts` (`mod.default.default ?? mod.default`). Require `rbac.fieldVisibility` (path to the oracle module exporting `getVisibleContactFields`/`getEditableContactFields`) and `rbac.roles` (narrowest→broadest) or `personas.matrix`.
2. Compute `date` (YYYY-MM-DD) + `runId` (`qa-rbac-<YYYYMMDD-HHmmss>`).
3. **Deterministic lattice gate (always):** `pnpm exec tsx <qa-kit>/bin/qa-rbac.mjs '<config json>' '<absolute oracle path>' '<cfg.findings.dir>' '<runId>' '<date>'`. Fails (exit 1) on a critical lattice violation — i.e. a narrower role's oracle field set isn't a subset of a broader role's.
4. **Live tournament (when a deployed env + personas are available):** run `Workflow({ name: "qa-rbac-tournament", args: <config + repoRoot> })`. Map each returned verdict finding → `evalResultToScoredFinding`-style `Finding` (dimension "rbac", verifiedBy "tournament", severity from the verdict, evidence = role+field+screen, location { persona: narrowerRole, route: screen }) and append to the findings file. Surface the two known anomalies if present (student_leader writes staff_only stories it can't read; canSubmitReports excludes area/regional_director).
5. Print findings ranked critical→low.

Do not modify application code.
