---
description: Pixel-diff screenshots against baselines and run an AI UX eval, writing scored visual findings.
---

Run the qa-kit visual eval:

1. Load `qa.config.ts` (interop: `mod.default.default ?? mod.default`). Read `rubrics.visual` (`baselineDir`, `maxDiffPixelRatio`, `aiReview`).
2. Ensure fresh screenshots exist (run the app's screenshot suite if needed, e.g. `pnpm e2e` producing PNGs under the actual dir).
3. Compute `date` (YYYY-MM-DD) and `runId` (`qa-visual-<YYYYMMDD-HHmmss>`).
4. Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY node <qa-kit>/bin/qa-visual-eval.mjs '<json-stringified config>' '<baselineDir>' '<actualDir>' '<cfg.findings.dir>' '<runId>' '<date>'`.
5. Print the ranked findings (by severity) and the written findings path.

Do not modify application code.
