import { createHash } from "node:crypto";

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
