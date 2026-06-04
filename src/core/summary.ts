import { compareSeverity, dedupeFindings, type Finding, SEVERITIES } from "./finding.js";

export type FindingsSummary = {
  ranked: Finding[]; // deduped, sorted critical→low
  byDimension: Record<string, Record<string, number>>; // dimension → severity → count (deduped)
  totals: Record<string, number>; // severity → count (deduped), incl. zeros for absent severities
  total: number; // total deduped findings
};

// Pure consolidation helper: dedupes a flat list of findings (collapsing same-id
// entries to their highest severity), ranks them critical-first, and tallies
// per-dimension×severity and per-severity totals. Used by qa-report to produce
// one consolidated cross-dimension view of a whole run.
export function summarizeFindings(findings: Finding[]): FindingsSummary {
  const deduped = dedupeFindings(findings);
  const ranked = [...deduped].sort((a, b) => compareSeverity(a.severity, b.severity));

  // Seed every severity at zero so an absent severity reports 0 (never undefined).
  const totals: Record<string, number> = {};
  for (const sev of SEVERITIES) totals[sev] = 0;

  const byDimension: Record<string, Record<string, number>> = {};
  for (const f of deduped) {
    totals[f.severity] = (totals[f.severity] ?? 0) + 1;
    const dim = (byDimension[f.dimension] ??= {});
    dim[f.severity] = (dim[f.severity] ?? 0) + 1;
  }

  return { ranked, byDimension, totals, total: deduped.length };
}
