// ~/qa-kit/bin/qa-rbac.mjs
// Usage: tsx bin/qa-rbac.mjs <config-json> <oracleModulePath> <outDir> <runId> <date>
// Deterministic RBAC lattice gate: calls the app's getVisibleContactFields/
// getEditableContactFields per role, checks the strict-subset lattice. Exit 1 on critical.
import { latticeViolations } from "qa-kit/evals";
import { writeFindings } from "qa-kit/core";

const [cfgJson, oraclePath, outDir, runId, date] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const roles = cfg.rbac?.roles ?? cfg.personas?.matrix ?? [];
if (!oraclePath || roles.length === 0) {
  console.error("qa:rbac — need rbac.fieldVisibility (oracle path) + rbac.roles/personas.matrix"); process.exit(2);
}
if (!cfg.app?.name) {
  console.error("qa:rbac — config needs app.name"); process.exit(2);
}

// A CJS-authored / differently-transpiled oracle exposes its named exports under
// `oracle.default` (the CJS/ESM double-default interop) — tolerate both shapes.
const oracle = await import(oraclePath);
const o = oracle.default ?? oracle;
const getVisible = o.getVisibleContactFields ?? oracle.getVisibleContactFields;
const getEditable = o.getEditableContactFields ?? oracle.getEditableContactFields;
if (typeof getVisible !== "function" || typeof getEditable !== "function") {
  console.error(`qa:rbac — oracle ${oraclePath} must export getVisibleContactFields + getEditableContactFields`); process.exit(2);
}

const visibleByRole = {}, editableByRole = {};
for (const role of roles) {
  visibleByRole[role] = getVisible(role);
  editableByRole[role] = getEditable(role);
}

const findings = [
  ...latticeViolations({ app: cfg.app.name, runId, date, kind: "visible", hierarchy: roles, fieldSetsByRole: visibleByRole }),
  ...latticeViolations({ app: cfg.app.name, runId, date, kind: "editable", hierarchy: roles, fieldSetsByRole: editableByRole }),
];
const path = writeFindings(outDir, { date, runId }, findings);

// Best-effort dashboard ingest — never affects the gate's pass/fail.
if (process.env.QA_DASHBOARD_SUPABASE_URL && process.env.QA_DASHBOARD_SERVICE_KEY) {
  try {
    const { ingestFindings } = await import("qa-kit/dashboard");
    const r = await ingestFindings({
      url: process.env.QA_DASHBOARD_SUPABASE_URL, key: process.env.QA_DASHBOARD_SERVICE_KEY,
      findings, scoreRows: [],
    });
    console.log(r.ok ? "qa:dashboard — ingested" : `qa:dashboard — ingest errors: ${r.errors.join("; ")}`);
  } catch (e) { console.warn(`qa:dashboard — ingest skipped: ${e instanceof Error ? e.message : e}`); }
}

const crit = findings.filter((f) => f.severity === "critical").length;
console.log(`qa:rbac (lattice) — ${findings.length} violations (${crit} critical) written to ${path}`);
if (crit > 0) { console.error("qa:rbac FAILED — critical RBAC lattice violation."); process.exit(1); }
