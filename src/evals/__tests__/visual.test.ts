import { describe, it, expect } from "vitest";
import { severityToScore, needsAiReview } from "../visual.js";

describe("severityToScore", () => {
  it("maps Claude severities to (score, Finding severity)", () => {
    expect(severityToScore("critical")).toEqual({ value: 10, max: 100, severity: "high" });
    expect(severityToScore("warning")).toEqual({ value: 25, max: 100, severity: "medium" });
    expect(severityToScore("info")).toEqual({ value: 75, max: 100, severity: "info" });
  });
});

describe("needsAiReview", () => {
  it("true when diff >= threshold; false below; true when no baseline (diffRatio null)", () => {
    expect(needsAiReview(0.05, 0.02)).toBe(true);
    expect(needsAiReview(0.01, 0.02)).toBe(false);
    expect(needsAiReview(null, 0.02)).toBe(true);
  });
});

import { runVisualEval } from "../visual.js";

describe("runVisualEval", () => {
  it("emits a scored visual Finding per AI-reviewed screenshot", async () => {
    const findings = await runVisualEval({
      app: "student-data", runId: "r1", date: "2026-06-03",
      maxDiffPixelRatio: 0.02, aiReview: true,
      shots: [
        { name: "home", route: "/home", diffRatio: 0.05 },
        { name: "people", route: "/people", diffRatio: 0.001 }, // below threshold → skipped
      ],
      analyze: async (shot) => ({ severity: "critical", issues: ["contrast too low"], summary: `bad ${shot.name}` }),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dimension: "visual", severity: "high", title: "home" });
    expect(findings[0].score).toEqual({ value: 10, max: 100, weight: undefined, rubricKey: "visual" });
    expect(findings[0].location).toEqual({ route: "/home" });
    expect(findings[0].evidence).toContain("bad home");
  });
  it("skips all AI when aiReview is false (returns [])", async () => {
    const findings = await runVisualEval({
      app: "a", runId: "r", date: "d", maxDiffPixelRatio: 0.02, aiReview: false,
      shots: [{ name: "x", route: "/x", diffRatio: 0.9 }],
      analyze: async () => ({ severity: "critical", issues: [], summary: "" }),
    });
    expect(findings).toEqual([]);
  });
});
