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

const oracle = await import(oraclePath);
const getVisible = oracle.getVisibleContactFields;
const getEditable = oracle.getEditableContactFields;
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
const crit = findings.filter((f) => f.severity === "critical").length;
console.log(`qa:rbac (lattice) — ${findings.length} violations (${crit} critical) written to ${path}`);
if (crit > 0) { console.error("qa:rbac FAILED — critical RBAC lattice violation."); process.exit(1); }
