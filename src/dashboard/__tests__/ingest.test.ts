import { describe, it, expect } from "vitest";
import { findingToRow, scoreTrendToRow } from "../ingest.js";
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
