import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const DIMENSIONS = ["tenancy", "rbac", "functional", "regression", "visual", "a11y", "perf"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Finding = {
  id: string;
  app: string;
  runId: string;
  dimension: Dimension;
  severity: Severity;
  title: string;
  location: { file?: string; line?: number; route?: string; persona?: string };
  evidence: string;
  repro: string;
  verifiedBy: "adversarial" | "tournament" | "single" | "deterministic";
  status: "confirmed" | "refuted" | "known";
  score?: { value: number; max: number; weight?: number; dimension: string };
  suggestedFix?: string;
  firstSeen: string;
  lastSeen: string;
};

// Stable identity for dedupe + regression tracking. Excludes runId/timestamps
// so the same logical finding hashes identically across runs.
export function makeFindingId(
  f: Pick<Finding, "app" | "dimension" | "title"> & { location?: Finding["location"] },
): string {
  const loc = f.location ?? {};
  const key = [f.app, f.dimension, f.title, loc.file ?? "", loc.line ?? "", loc.route ?? ""].join("::");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const existing = byId.get(f.id);
    if (!existing) { byId.set(f.id, f); continue; }
    const higher = compareSeverity(f.severity, existing.severity) < 0 ? f : existing;
    byId.set(f.id, {
      ...higher,
      firstSeen: existing.firstSeen < f.firstSeen ? existing.firstSeen : f.firstSeen,
      lastSeen: existing.lastSeen > f.lastSeen ? existing.lastSeen : f.lastSeen,
    });
  }
  return [...byId.values()];
}

export function writeFindings(baseDir: string, opts: { date: string; runId: string }, findings: Finding[]): string {
  const dir = join(baseDir, opts.date);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${opts.runId}.json`);
  writeFileSync(path, JSON.stringify(findings, null, 2));
  return path;
}

export function readFindings(path: string): Finding[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as Finding[];
}

type TenancyVerdict = {
  site: string; file?: string; line?: number;
  exploitable: boolean; severity: Severity;
  reasoning: string; twoTenantRepro: string; suggestedFix?: string;
};

export function verdictsToFindings(args: {
  app: string; runId: string; date: string; verdicts: readonly TenancyVerdict[];
}): Finding[] {
  return args.verdicts.map((v) => {
    const location = { file: v.file, line: v.line };
    return {
      id: makeFindingId({ app: args.app, dimension: "tenancy", title: v.site, location }),
      app: args.app,
      runId: args.runId,
      dimension: "tenancy" as const,
      severity: v.severity,
      title: v.site,
      location,
      evidence: v.reasoning,
      repro: v.twoTenantRepro,
      verifiedBy: "adversarial" as const,
      status: v.exploitable ? ("confirmed" as const) : ("refuted" as const),
      suggestedFix: v.suggestedFix,
      firstSeen: args.date,
      lastSeen: args.date,
    };
  });
}
