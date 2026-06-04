// ~/qa-kit/bin/qa-deploy-gate.mjs
// Usage: node bin/qa-deploy-gate.mjs <config-json> <deployedUrl> <expectedSha> <outDir> <runId> <date>
// Deterministic deploy gate: bundle-truth (deployed SHA == expected) + round-trips.
// Exits 1 if any CRITICAL finding (stale build or round-trip failure).
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { bundleTruthVerdict, roundtripResultsToFindings } from "qa-kit/evals";
import { writeFindings, makeFindingId } from "qa-kit/core";

const [cfgJson, url, expectedSha, outDir, runId, date] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const healthPath = cfg.commands?.healthPath ?? cfg.envs?.staging?.healthPath ?? "/api/health";

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
  // Force the JSON reporter via CLI args (PW_TEST_REPORTER is NOT a real env var,
  // so it would never activate). Appending to the `pnpm run` script forwards the
  // args to `playwright test`; `line` keeps human output on the inherited stdio.
  const cmd = (cfg.commands?.e2eRoundtrip ?? "pnpm e2e:roundtrip") + " --reporter=json,line";
  try {
    execSync(cmd, {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_BASE_URL: url, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath },
    });
  } catch { /* non-zero exit = some specs failed; the report is parsed below, and the missing-report guard catches a crash/no-run */ }
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    findings.push(...roundtripResultsToFindings({ app: cfg.app.name, runId, date, report }));
  } else {
    // No report despite round-trips being scheduled = suite crashed or never ran.
    // Treat as a finding (NOT silent zero) so a missing report can't look "all passed".
    const location = { route: "(round-trip suite)" };
    findings.push({
      id: makeFindingId({ app: cfg.app.name, dimension: "regression", title: "round-trip report missing", location }),
      app: cfg.app.name, runId, dimension: "regression", severity: "high",
      title: "round-trip report missing — suite may have crashed; gate could not verify",
      location, evidence: `expected Playwright JSON report at ${reportPath} but none was written`,
      repro: cmd, verifiedBy: "deterministic", status: "confirmed",
      firstSeen: date, lastSeen: date,
    });
  }
}

const path = writeFindings(outDir, { date, runId }, findings);
const criticals = findings.filter((f) => f.severity === "critical").length;
console.log(`qa:deploy-gate — ${findings.length} findings (${criticals} critical) written to ${path}`);
if (criticals > 0) { console.error("qa:deploy-gate FAILED — critical findings block this deploy."); process.exit(1); }
