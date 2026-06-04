// ~/qa-kit/bin/qa-visual-eval.mjs
// Usage: ANTHROPIC_API_KEY=... node bin/qa-visual-eval.mjs <config-json> <baselineDir> <actualDir> <outDir> <runId> <date>
// Pixel-diffs actual vs baseline, asks Claude Sonnet for UX analysis on changed shots, writes scored Findings.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { runVisualEval } from "qa-kit/evals";
import { writeFindings } from "qa-kit/core";

const [cfgJson, baselineDir, actualDir, outDir, runId, date] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const rub = cfg.rubrics?.visual ?? { maxDiffPixelRatio: 0.02, aiReview: true };

function diffRatio(actualPath, baselinePath) {
  if (!existsSync(baselinePath)) return null;
  const a = PNG.sync.read(readFileSync(actualPath));
  const b = PNG.sync.read(readFileSync(baselinePath));
  if (a.width !== b.width || a.height !== b.height) return 1;
  const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.2 });
  return n / (a.width * a.height);
}

if (!existsSync(actualDir)) {
  console.error(`qa:visual-eval: actual dir not found: ${actualDir}`);
  process.exit(1);
}

const shots = readdirSync(actualDir).filter((f) => f.endsWith(".png")).map((f) => ({
  name: basename(f, ".png"),
  file: join(actualDir, f),
  diffRatio: diffRatio(join(actualDir, f), join(baselineDir, f)),
}));

// Marker summary the orchestrator uses to count shots that fell back to a
// degraded (non-AI) analysis so a fully-broken run never *looks* clean.
const DEGRADED_SUMMARY = "AI review failed";
const degraded = (reason) => ({ severity: "info", issues: [`AI review failed: ${reason}`], summary: DEGRADED_SUMMARY });

async function analyze(shot) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { severity: "info", issues: ["No ANTHROPIC_API_KEY — skipped"], summary: "Skipped" };
  const b64 = readFileSync(shot.file).toString("base64");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 800,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
          { type: "text", text: `You are a UX expert reviewing a UI screenshot (${shot.name}, diff ${shot.diffRatio}). Reply ONLY JSON: {"severity":"info|warning|critical","issues":[],"summary":""}` },
        ] }],
      }),
    });
    // A non-200 must degrade this shot, not abort the whole eval.
    if (!res.ok) return degraded(`HTTP ${res.status}`);
    const txt = (await res.json()).content?.[0]?.text ?? "{}";
    const m = txt.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : "{}");
  } catch (err) {
    // Transient network error / unparseable body — degrade this one shot.
    return degraded(err instanceof Error ? err.message : String(err));
  }
}

// Wrap `analyze` to count shots whose AI review fell back to a degraded result,
// so a fully-broken run reports the failures instead of looking clean.
let degradedCount = 0;
const countingAnalyze = async (shot) => {
  const a = await analyze(shot);
  if (a && a.summary === DEGRADED_SUMMARY) degradedCount++;
  return a;
};

const findings = await runVisualEval({
  app: cfg.app.name, runId, date,
  maxDiffPixelRatio: rub.maxDiffPixelRatio ?? 0.02,
  aiReview: rub.aiReview !== false,
  shots, analyze: countingAnalyze,
});
const path = writeFindings(outDir, { date, runId }, findings);
console.log(`qa:visual-eval — ${findings.length} findings written to ${path} (${degradedCount} shots failed AI review)`);
if (degradedCount > 0) {
  console.warn(`qa:visual-eval: WARNING — ${degradedCount} shot(s) fell back to a degraded analysis (AI review failed). These findings are written but were NOT AI-reviewed; investigate the AI call (API key, rate limits, network) before trusting this run.`);
}
