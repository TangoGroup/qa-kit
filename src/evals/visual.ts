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
