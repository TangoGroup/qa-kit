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

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function ingestFindings(args: {
  url: string; key: string;
  findings: Finding[]; scoreRows: ScoreTrendInput[];
  fetchImpl?: FetchLike;
}): Promise<{ ok: boolean; errors: string[] }> {
  const doFetch = args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers = {
    apikey: args.key, Authorization: `Bearer ${args.key}`,
    "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal",
  };
  const errors: string[] = [];
  const post = async (table: string, rows: unknown[]) => {
    if (!rows.length) return;
    try {
      const res = await doFetch(`${args.url}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows) });
      if (!res.ok) errors.push(`${table}: HTTP ${res.status} ${await res.text()}`);
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  await post("qa_findings", args.findings.map(findingToRow));
  await post("qa_score_trend", args.scoreRows.map(scoreTrendToRow));
  return { ok: errors.length === 0, errors };
}
