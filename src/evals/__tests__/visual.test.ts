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
