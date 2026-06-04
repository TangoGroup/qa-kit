import { type Finding, type Severity, makeFindingId } from "../core/finding.js";

export type AuditFinding = { route: string; kind: string; selector: string; detail: string };

const FP_SELECTOR = [/sr-only/, /visually-hidden/, /aria-hidden=['"]true['"]/];
const FP_TAP = /\b1×\d+px|\d+×1px/;

export function isAuditFalsePositive(f: { kind: string; selector: string; detail: string }): boolean {
  if (FP_SELECTOR.some((r) => r.test(f.selector) || r.test(f.detail))) return true;
  if (f.kind === "small-tap-target" && FP_TAP.test(f.detail)) return true;
  return false;
}

export function auditFindingsToFindings(args: {
  app: string; runId: string; date: string;
  blockOn: Record<string, string>;
  defaultSeverity?: Severity;
  audit: AuditFinding[];
}): Finding[] {
  const byId = new Map<string, Finding>();
  for (const a of args.audit) {
    if (isAuditFalsePositive(a)) continue;
    const severity = (args.blockOn[a.kind] ?? args.defaultSeverity ?? "medium") as Severity;
    const location = { route: a.route };
    const id = makeFindingId({ app: args.app, dimension: "a11y", title: a.kind, location });
    if (byId.has(id)) continue;
    byId.set(id, {
      id, app: args.app, runId: args.runId,
      dimension: "a11y", severity, title: a.kind, location,
      evidence: a.detail, repro: a.selector,
      verifiedBy: "deterministic", status: "confirmed",
      firstSeen: args.date, lastSeen: args.date,
    });
  }
  return [...byId.values()];
}
