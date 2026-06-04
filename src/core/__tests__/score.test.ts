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
});
