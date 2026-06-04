import type { Finding } from "../core/finding.js";

export type FindingRow = {
  app: string; id: string; run_id: string; dimension: string; severity: string;
  title: string; location: Finding["location"]; evidence: string; repro: string;
  verified_by: string; status: string; score: Finding["score"] | null;
  suggested_fix: string | null; first_seen: string; last_seen: string;
};

export function findingToRow(f: Finding): FindingRow {
  return {
    app: f.app, id: f.id, run_id: f.runId, dimension: f.dimension, severity: f.severity,
    title: f.title, location: f.location, evidence: f.evidence, repro: f.repro,
    verified_by: f.verifiedBy, status: f.status, score: f.score ?? null,
    suggested_fix: f.suggestedFix ?? null, first_seen: f.firstSeen, last_seen: f.lastSeen,
  };
}

export type ScoreTrendInput = {
  stableId: string; app: string; dimension: string; rubricKey: string;
  value: number; max: number; weight?: number; timestamp: string; runId: string; persona?: string;
};
export type ScoreTrendRow = {
  app: string; stable_id: string; dimension: string; rubric_key: string;
  value: number; max: number; weight?: number; run_id: string; persona?: string; ts: string;
};

export function scoreTrendToRow(s: ScoreTrendInput): ScoreTrendRow {
  return {
    app: s.app, stable_id: s.stableId, dimension: s.dimension, rubric_key: s.rubricKey,
    value: s.value, max: s.max, weight: s.weight, run_id: s.runId, persona: s.persona, ts: s.timestamp,
  };
}
