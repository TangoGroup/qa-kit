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

const shots = readdirSync(actualDir).filter((f) => f.endsWith(".png")).map((f) => ({
  name: basename(f, ".png"),
  file: join(actualDir, f),
  diffRatio: diffRatio(join(actualDir, f), join(baselineDir, f)),
}));

async function analyze(shot) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { severity: "info", issues: ["No ANTHROPIC_API_KEY — skipped"], summary: "Skipped" };
  const b64 = readFileSync(shot.file).toString("base64");
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
  const txt = (await res.json()).content?.[0]?.text ?? "{}";
  const m = txt.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : "{}"); } catch { return { severity: "info", issues: ["unparseable"], summary: txt.slice(0, 120) }; }
}

const findings = await runVisualEval({ app: cfg.app.name, runId, date, maxDiffPixelRatio: rub.maxDiffPixelRatio ?? 0.02, aiReview: rub.aiReview !== false, shots, analyze });
const path = writeFindings(outDir, { date, runId }, findings);
console.log(`qa:visual-eval — ${findings.length} findings written to ${path}`);
