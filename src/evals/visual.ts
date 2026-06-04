export type AiSeverity = "info" | "warning" | "critical";

export function severityToScore(sev: AiSeverity): { value: number; max: number; severity: "high" | "medium" | "info" } {
  switch (sev) {
    case "critical": return { value: 10, max: 100, severity: "high" };
    case "warning": return { value: 25, max: 100, severity: "medium" };
    case "info": return { value: 75, max: 100, severity: "info" };
  }
}

// A new/changed screenshot needs AI review when it has no baseline (diffRatio null)
// or its pixel diff meets/exceeds the configured ratio.
export function needsAiReview(diffRatio: number | null, maxDiffPixelRatio: number): boolean {
  if (diffRatio === null) return true;
  return diffRatio >= maxDiffPixelRatio;
}

import { evalResultToScoredFinding } from "../core/score.js";
import type { Finding } from "../core/finding.js";

export type Shot = { name: string; route?: string; file?: string; diffRatio: number | null };
export type AiAnalysis = { severity: AiSeverity; issues: string[]; summary: string };

export async function runVisualEval(args: {
  app: string; runId: string; date: string;
  maxDiffPixelRatio: number; aiReview: boolean;
  shots: Shot[];
  analyze: (shot: Shot) => Promise<AiAnalysis>;
}): Promise<Finding[]> {
  if (!args.aiReview) return [];
  const out: Finding[] = [];
  for (const shot of args.shots) {
    if (!needsAiReview(shot.diffRatio, args.maxDiffPixelRatio)) continue;
    const a = await args.analyze(shot);
    // Belt-and-suspenders: a malformed analysis (e.g. missing/unknown severity)
    // must never crash the loop — coerce anything unexpected to "info".
    const sev: AiSeverity =
      a.severity === "critical" || a.severity === "warning" || a.severity === "info" ? a.severity : "info";
    const s = severityToScore(sev);
    // Guard malformed analyses: summary may be absent and issues may not be an array.
    const summary = typeof a.summary === "string" ? a.summary : "";
    const issues = Array.isArray(a.issues) ? a.issues : [];
    out.push(evalResultToScoredFinding({
      app: args.app, runId: args.runId, date: args.date,
      dimension: "visual", title: shot.name, severity: s.severity,
      value: s.value, max: s.max, rubricKey: "visual",
      evidence: `${summary}${issues.length ? " — " + issues.join("; ") : ""}`,
      location: { route: shot.route, file: shot.file },
    }));
  }
  return out;
}
