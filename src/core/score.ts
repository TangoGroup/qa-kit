import { type RubricsConfig } from "./config.js";
import { type Dimension, type Finding, makeFindingId } from "./finding.js";

export function evalResultToScoredFinding(args: {
  app: string; runId: string; date: string;
  dimension: Dimension;
  title: string;
  severity: Finding["severity"];
  value: number; max: number; weight?: number; rubricKey: string;
  evidence?: string; repro?: string;
  location?: Finding["location"];
  verifiedBy?: Finding["verifiedBy"];
}): Finding {
  const location: Finding["location"] = {};
  if (args.location) {
    if (args.location.file !== undefined) location.file = args.location.file;
    if (args.location.line !== undefined) location.line = args.location.line;
    if (args.location.route !== undefined) location.route = args.location.route;
    if (args.location.persona !== undefined) location.persona = args.location.persona;
  }
  return {
    id: makeFindingId({ app: args.app, dimension: args.dimension, title: args.title, location }),
    app: args.app, runId: args.runId,
    dimension: args.dimension, severity: args.severity, title: args.title, location,
    evidence: args.evidence ?? "", repro: args.repro ?? "",
    verifiedBy: args.verifiedBy ?? "single",
    status: "confirmed",
    score: { value: args.value, max: args.max, weight: args.weight, rubricKey: args.rubricKey },
    firstSeen: args.date, lastSeen: args.date,
  };
}

export function scoresByDimension(findings: Finding[]): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {};
  for (const f of findings) {
    if (!f.score) continue;
    (out[f.score.rubricKey] ??= []).push(f);
  }
  return out;
}

export function aggregatePersonaScores(args: {
  findings: Finding[]; rubrics: RubricsConfig; persona: string;
}): {
  dimensionScores: Record<string, { value: number; max: number; weight: number }>;
  overall: { value: number; max: number };
  verdict: "pass" | "fail";
} {
  const dims = args.rubrics.persona?.dimensions ?? [];
  const personaFindings = args.findings.filter((f) => f.location?.persona === args.persona && f.score);
  const dimensionScores: Record<string, { value: number; max: number; weight: number }> = {};
  let weightedSum = 0;
  let weightTotal = 0;
  let maxRef = 5;
  for (const dim of dims) {
    const f = personaFindings.find((x) => x.score!.rubricKey === dim.key);
    if (!f) continue;
    const weight = dim.weight ?? 1;
    dimensionScores[dim.key] = { value: f.score!.value, max: f.score!.max, weight };
    weightedSum += f.score!.value * weight;
    weightTotal += weight;
    maxRef = f.score!.max;
  }
  const value = weightTotal ? weightedSum / weightTotal : 0;
  const threshold = args.rubrics.persona?.passThreshold ?? 0;
  return { dimensionScores, overall: { value, max: maxRef }, verdict: value >= threshold ? "pass" : "fail" };
}

export function prepareScoreTrend(args: { findings: Finding[]; timestamp: string }): Array<{
  stableId: string; app: string; dimension: Dimension; rubricKey: string;
  value: number; max: number; weight?: number; timestamp: string; runId: string; persona?: string;
}> {
  return args.findings.filter((f) => f.score).map((f) => ({
    stableId: f.id, app: f.app, dimension: f.dimension, rubricKey: f.score!.rubricKey,
    value: f.score!.value, max: f.score!.max, weight: f.score!.weight,
    timestamp: args.timestamp, runId: f.runId, persona: f.location?.persona,
  }));
}
