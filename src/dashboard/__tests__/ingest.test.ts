import { describe, it, expect } from "vitest";
import { findingToRow, scoreTrendToRow, ingestFindings } from "../ingest.js";
import type { Finding } from "../../core/finding.js";

const f: Finding = {
  id: "abc", app: "student-data", runId: "r1", dimension: "tenancy", severity: "critical",
  title: "Calendar IDOR", location: { route: "/api/calendar/[campusId]" }, evidence: "no check",
  repro: "GET ...", verifiedBy: "adversarial", status: "confirmed",
  score: { value: 2, max: 5, rubricKey: "taskCompletion" }, suggestedFix: "add guard",
  firstSeen: "2026-06-04", lastSeen: "2026-06-04",
};

describe("findingToRow", () => {
  it("maps a Finding to the snake_case row shape", () => {
    expect(findingToRow(f)).toEqual({
      app: "student-data", id: "abc", run_id: "r1", dimension: "tenancy", severity: "critical",
      title: "Calendar IDOR", location: { route: "/api/calendar/[campusId]" }, evidence: "no check",
      repro: "GET ...", verified_by: "adversarial", status: "confirmed",
      score: { value: 2, max: 5, rubricKey: "taskCompletion" }, suggested_fix: "add guard",
      first_seen: "2026-06-04", last_seen: "2026-06-04",
    });
  });
  it("nulls score/suggested_fix when absent", () => {
    const r = findingToRow({ ...f, score: undefined, suggestedFix: undefined });
    expect(r.score).toBeNull();
    expect(r.suggested_fix).toBeNull();
  });
});

describe("scoreTrendToRow", () => {
  it("maps a prepareScoreTrend row to the snake_case row shape", () => {
    expect(scoreTrendToRow({
      stableId: "s1", app: "a", dimension: "functional", rubricKey: "clarity",
      value: 4, max: 5, weight: 1, timestamp: "2026-06-04T00:00:00Z", runId: "r1", persona: "jake",
    })).toEqual({
      app: "a", stable_id: "s1", dimension: "functional", rubric_key: "clarity",
      value: 4, max: 5, weight: 1, run_id: "r1", persona: "jake", ts: "2026-06-04T00:00:00Z",
    });
  });
});

describe("ingestFindings", () => {
  it("POSTs upserts to both PostgREST tables with auth + merge headers", async () => {
    const calls: { url: string; init: any }[] = [];
    const fakeFetch = async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, status: 201, text: async () => "" }; };
    const res = await ingestFindings({
      url: "https://proj.supabase.co", key: "svc_key",
      findings: [f], scoreRows: [{ stableId: "s1", app: "a", dimension: "functional", rubricKey: "clarity", value: 4, max: 5, runId: "r1", timestamp: "2026-06-04T00:00:00Z" }],
      fetchImpl: fakeFetch as any,
    });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const findingsCall = calls.find((c) => c.url.includes("qa_findings"))!;
    expect(findingsCall.url).toBe("https://proj.supabase.co/rest/v1/qa_findings");
    expect(findingsCall.init.method).toBe("POST");
    expect(findingsCall.init.headers.apikey).toBe("svc_key");
    expect(findingsCall.init.headers.Authorization).toBe("Bearer svc_key");
    expect(findingsCall.init.headers.Prefer).toContain("resolution=merge-duplicates");
    expect(JSON.parse(findingsCall.init.body)[0].app).toBe("student-data");
    expect(calls.some((c) => c.url.includes("qa_score_trend"))).toBe(true);
  });
  it("returns ok:false with status on a failed POST (never throws)", async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => "no auth" });
    const res = await ingestFindings({ url: "u", key: "k", findings: [f], scoreRows: [], fetchImpl: fakeFetch as any });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("401");
  });
  it("skips a table when its array is empty (no wasted call)", async () => {
    const calls: any[] = [];
    const fakeFetch = async (url: string) => { calls.push(url); return { ok: true, status: 201, text: async () => "" }; };
    await ingestFindings({ url: "u", key: "k", findings: [f], scoreRows: [], fetchImpl: fakeFetch as any });
    expect(calls).toHaveLength(1); // only qa_findings
  });
});
