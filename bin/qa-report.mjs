// ~/qa-kit/bin/qa-report.mjs
// Usage: tsx bin/qa-report.mjs <config-json> <findingsDir> <date>
// Aggregates EVERY <findingsDir>/<date>/*.json (each a Finding[] written by one
// dimension of a run) into a single consolidated, deduped + ranked report, then
// best-effort ingests the deduped union to the cross-app dashboard.
//
// Pure reporting: it does NOT exit non-zero on findings (that's each dimension's
// own gate job). It's the "what did the whole sweep find" view.
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { summarizeFindings, readFindings, SEVERITIES } from "qa-kit/core";

const [cfgJson, findingsDir, date] = process.argv.slice(2);
if (!cfgJson || !findingsDir || !date) {
  console.error("qa:report — usage: qa-report <config-json> <findingsDir> <date>");
  process.exit(2);
}
const cfg = JSON.parse(cfgJson);
if (!cfg.app?.name) {
  console.error("qa:report — config needs app.name");
  process.exit(2);
}

const dayDir = join(findingsDir, date);
if (!existsSync(dayDir) || !statSync(dayDir).isDirectory()) {
  console.error(`qa:report — no findings dir at ${dayDir} (nothing to aggregate).`);
  process.exit(0);
}

// Read every *.json under the day dir; each file is a Finding[] from one
// dimension. We aggregate the union across all of them.
const files = readdirSync(dayDir).filter((f) => f.endsWith(".json"));
const all = [];
let read = 0;
for (const f of files) {
  const path = join(dayDir, f);
  try {
    const found = readFindings(path);
    if (Array.isArray(found)) {
      all.push(...found);
      read++;
    }
  } catch (e) {
    // A malformed file shouldn't sink the whole report; note it and continue.
    console.warn(`qa:report — skipped unreadable ${f}: ${e instanceof Error ? e.message : e}`);
  }
}

const { ranked, byDimension, totals, total } = summarizeFindings(all);

// ---- Consolidated report ----
console.log(`\nqa:report — ${cfg.app.name} — ${date}`);
console.log(`Aggregated ${read} dimension file(s) from ${dayDir}`);

const totalsLine = SEVERITIES.map((s) => `${totals[s]} ${s}`).join(", ");
console.log(`\n${total} findings — ${totalsLine}`);

// Per-dimension × severity table.
if (total > 0) {
  const dims = Object.keys(byDimension).sort();
  const colW = 12;
  const header = "dimension".padEnd(14) + SEVERITIES.map((s) => s.padStart(colW)).join("") + "total".padStart(colW);
  console.log(`\n${header}`);
  console.log("-".repeat(header.length));
  for (const dim of dims) {
    const row = byDimension[dim];
    const dimTotal = SEVERITIES.reduce((n, s) => n + (row[s] ?? 0), 0);
    const line = dim.padEnd(14) + SEVERITIES.map((s) => String(row[s] ?? 0).padStart(colW)).join("") + String(dimTotal).padStart(colW);
    console.log(line);
  }

  // Ranked critical + high titles with location.
  const topRanked = ranked.filter((f) => f.severity === "critical" || f.severity === "high");
  if (topRanked.length) {
    console.log(`\nRanked critical/high (${topRanked.length}):`);
    for (const f of topRanked) {
      const loc = f.location ?? {};
      const where = loc.file
        ? `${loc.file}${loc.line ? `:${loc.line}` : ""}`
        : loc.route
          ? loc.route
          : loc.persona
            ? `persona:${loc.persona}`
            : "(no location)";
      console.log(`  [${f.severity.toUpperCase()}] (${f.dimension}) ${f.title} — ${where}`);
    }
  } else {
    console.log("\nNo critical/high findings.");
  }
} else {
  console.log("\nNo findings recorded for this run.");
}

// ---- Best-effort dashboard ingest of the deduped union ----
// Gated on both env vars; wrapped so an ingest failure never throws out of the report.
if (process.env.QA_DASHBOARD_SUPABASE_URL && process.env.QA_DASHBOARD_SERVICE_KEY) {
  try {
    const { ingestFindings } = await import("qa-kit/dashboard");
    const r = await ingestFindings({
      url: process.env.QA_DASHBOARD_SUPABASE_URL,
      key: process.env.QA_DASHBOARD_SERVICE_KEY,
      findings: ranked, // deduped union, already consolidated
      scoreRows: [],
    });
    console.log(r.ok ? "\nqa:dashboard — ingested" : `\nqa:dashboard — ingest errors: ${r.errors.join("; ")}`);
  } catch (e) {
    console.warn(`\nqa:dashboard — ingest skipped: ${e instanceof Error ? e.message : e}`);
  }
} else {
  console.log("\nqa:dashboard — ingest skipped (QA_DASHBOARD_SUPABASE_URL / QA_DASHBOARD_SERVICE_KEY unset)");
}
