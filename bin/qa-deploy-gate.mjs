// ~/qa-kit/bin/qa-deploy-gate.mjs
// Usage: node bin/qa-deploy-gate.mjs <config-json> <deployedUrl> <expectedSha> <outDir> <runId> <date>
// Deterministic deploy gate: bundle-truth (deployed SHA == expected) + round-trips.
// Exits 1 if any CRITICAL finding (stale build or round-trip failure).
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { bundleTruthVerdict, roundtripResultsToFindings } from "qa-kit/evals";
import { writeFindings } from "qa-kit/core";

const [cfgJson, url, expectedSha, outDir, runId, date] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const healthPath = cfg.envs?.staging?.healthPath ?? cfg.commands?.healthPath ?? "/api/health";

async function fetchHealth() {
  try {
    const res = await fetch(`${url}${healthPath}`, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || typeof j.sha !== "string") return null;
    return { sha: j.sha, buildTime: j.buildTime ?? "", env: j.env ?? "" };
  } catch { return null; }
}

const findings = [];
const fetched = await fetchHealth();
const bt = bundleTruthVerdict({ app: cfg.app.name, runId, date, url, fetched, expectedSha: expectedSha ?? "" });
if (bt) findings.push(bt);

// Round-trips: only run if bundle-truth passed (no point testing a stale build).
if (!bt || bt.severity !== "critical") {
  const reportPath = join(outDir, `pw-${runId}.json`);
  const cmd = cfg.commands?.e2eRoundtrip ?? "pnpm e2e:roundtrip";
  try {
    execSync(cmd, {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_BASE_URL: url, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath, PW_TEST_REPORTER: "json" },
    });
  } catch { /* non-zero exit = some specs failed; we parse the report below */ }
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    findings.push(...roundtripResultsToFindings({ app: cfg.app.name, runId, date, report }));
  }
}

const path = writeFindings(outDir, { date, runId }, findings);
const criticals = findings.filter((f) => f.severity === "critical").length;
console.log(`qa:deploy-gate — ${findings.length} findings (${criticals} critical) written to ${path}`);
if (criticals > 0) { console.error("qa:deploy-gate FAILED — critical findings block this deploy."); process.exit(1); }
