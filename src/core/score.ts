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
