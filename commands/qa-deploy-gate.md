---
description: Post-deploy gate — verify the deployed build is the new bundle, run 3-role round-trips, re-verify recent fixes.
---

Run the qa-kit deploy gate against a deployed URL:

1. Load `qa.config.ts` (`mod.default.default ?? mod.default`). Determine the deployed `url` (the staging/prod alias just deployed) and the `expectedSha` (the git SHA you deployed — `git rev-parse HEAD`).
2. Compute `date` (YYYY-MM-DD) and `runId` (`qa-deploy-<YYYYMMDD-HHmmss>`).
3. Run the deterministic gate: `node <qa-kit>/bin/qa-deploy-gate.mjs '<json config>' '<url>' '<expectedSha>' '<cfg.findings.dir>' '<runId>' '<date>'`. This fails (exit 1) on a stale bundle or any round-trip failure.
4. **Agentic fix re-verification (advisory tier):** for each GitHub issue / finding marked "fixed in this deploy" (or feedback items moved to `staging` status), re-run its original repro against `url` and confirm it is actually gone. Report any that reproduce as HIGH. (This is the LLM tier — it does not block, but surfaces fixes that didn't actually ship.)
5. Print the verdict: PASS / FAIL. On FAIL, surface the rollback command: `vercel alias <previous-deployment-url> <alias> --scope team-gloo`.

Do not modify application code.
