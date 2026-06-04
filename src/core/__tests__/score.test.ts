import { describe, it, expect } from "vitest";
import { evalResultToScoredFinding } from "../score.js";
import { makeFindingId } from "../finding.js";

describe("evalResultToScoredFinding", () => {
  const base = {
    app: "student-data", runId: "r1", date: "2026-06-03",
    dimension: "visual" as const, title: "home fullPage",
    severity: "medium" as const, value: 25, max: 100, rubricKey: "visual",
    evidence: "layout shift on hero", location: { route: "/home" },
  };
  it("builds a scored Finding with stable id + status confirmed", () => {
    const f = evalResultToScoredFinding(base);
    expect(f.id).toBe(makeFindingId({ app: "student-data", dimension: "visual", title: "home fullPage", location: { route: "/home" } }));
    expect(f.dimension).toBe("visual");
    expect(f.severity).toBe("medium");
    expect(f.status).toBe("confirmed");
    expect(f.score).toEqual({ value: 25, max: 100, weight: undefined, rubricKey: "visual" });
    expect(f.firstSeen).toBe("2026-06-03");
  });
  it("omits undefined location keys (round-trip safe)", () => {
    const f = evalResultToScoredFinding({ ...base, location: undefined });
    expect(Object.keys(f.location)).toEqual([]);
  });
  it("defaults verifiedBy to 'single'", () => {
    expect(evalResultToScoredFinding(base).verifiedBy).toBe("single");
  });
  it("round-trips a provided weight onto score.weight", () => {
    const f = evalResultToScoredFinding({ ...base, weight: 1.5 });
    expect(f.score?.weight).toBe(1.5);
  });
});

import { scoresByRubricKey, aggregatePersonaScores } from "../score.js";
import type { Finding } from "../finding.js";
import type { RubricsConfig } from "../config.js";

const pf = (persona: string, rubricKey: string, value: number): Finding => ({
  id: `${persona}-${rubricKey}`, app: "a", runId: "r", dimension: "functional",
  severity: "low", title: `${persona}:${rubricKey}`, location: { persona },
  evidence: "", repro: "", verifiedBy: "single", status: "confirmed",
  score: { value, max: 5, rubricKey }, firstSeen: "d", lastSeen: "d",
});

describe("scoresByRubricKey", () => {
  it("groups scored findings by rubricKey", () => {
    const g = scoresByRubricKey([pf("jake", "taskCompletion", 3), pf("jake", "clarity", 4)]);
    expect(Object.keys(g).sort()).toEqual(["clarity", "taskCompletion"]);
  });
});

describe("aggregatePersonaScores", () => {
  const rubrics: RubricsConfig = { persona: { dimensions: [
    { key: "taskCompletion", weight: 1.5 }, { key: "clarity", weight: 1.0 },
  ], passThreshold: 3.0 } };
  it("computes weighted overall and pass/fail vs passThreshold", () => {
    const findings = [pf("jake", "taskCompletion", 2), pf("jake", "clarity", 5), pf("leader", "taskCompletion", 5)];
    const out = aggregatePersonaScores({ findings, rubrics, persona: "jake" });
    // (2*1.5 + 5*1.0) / (1.5+1.0) = 8/2.5 = 3.2
    expect(out.overall.value).toBeCloseTo(3.2);
    expect(out.overall.max).toBe(5);
    expect(out.verdict).toBe("pass");
    expect(out.dimensionScores.taskCompletion).toEqual({ value: 2, max: 5, weight: 1.5 });
  });
  it("fails when weighted overall is below threshold", () => {
    const out = aggregatePersonaScores({ findings: [pf("jake", "taskCompletion", 1), pf("jake", "clarity", 1)], rubrics, persona: "jake" });
    expect(out.verdict).toBe("fail");
  });
  it("takes overall.max from the FIRST matched dimension, not last-wins", () => {
    // Two dimensions whose findings carry different `max`; overall.max must be
    // the first matched dimension's max (10), not the last iteration's (3).
    const tenScale: Finding = { ...pf("jake", "taskCompletion", 8), score: { value: 8, max: 10, rubricKey: "taskCompletion" } };
    const threeScale: Finding = { ...pf("jake", "clarity", 2), score: { value: 2, max: 3, rubricKey: "clarity" } };
    const out = aggregatePersonaScores({ findings: [tenScale, threeScale], rubrics, persona: "jake" });
    expect(out.overall.max).toBe(10);
  });
  it("an unscored persona (no matched dimensions) fails — cannot pass unscored", () => {
    const out = aggregatePersonaScores({ findings: [], rubrics, persona: "jake" });
    expect(out.overall.value).toBe(0);
    expect(out.dimensionScores).toEqual({});
    expect(out.verdict).toBe("fail");
  });
  it("an unscored persona fails even when passThreshold is unset (would default to 0)", () => {
    // Guards the 0 >= 0 → "pass" trap: a never-scored persona must not pass.
    const noThreshold: RubricsConfig = { persona: { dimensions: [{ key: "taskCompletion", weight: 1 }] } };
    const out = aggregatePersonaScores({ findings: [], rubrics: noThreshold, persona: "jake" });
    expect(out.verdict).toBe("fail");
  });
});

import { prepareScoreTrend } from "../score.js";

describe("prepareScoreTrend", () => {
  it("formats scored findings for dashboard ingest (drops unscored)", () => {
    const rows = prepareScoreTrend({
      findings: [pf("jake", "clarity", 4), { ...pf("jake", "x", 0), score: undefined }],
      timestamp: "2026-06-03T00:00:00Z",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ app: "a", dimension: "functional", value: 4, max: 5, persona: "jake", runId: "r", timestamp: "2026-06-03T00:00:00Z" });
    expect(rows[0].stableId).toBe("jake-clarity");
  });
});
