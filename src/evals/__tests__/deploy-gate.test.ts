import { describe, it, expect } from "vitest";
import { bundleTruthVerdict } from "../deploy-gate.js";

const base = { app: "student-data", runId: "r1", date: "2026-06-04", url: "https://staging.example.com" };

describe("bundleTruthVerdict", () => {
  it("returns null (no finding) when deployed sha matches expected", () => {
    const f = bundleTruthVerdict({ ...base, fetched: { sha: "abc1234", buildTime: "t", env: "preview" }, expectedSha: "abc1234deadbeef" });
    expect(f).toBeNull();
  });
  it("matches on 7-char short-sha prefix", () => {
    expect(bundleTruthVerdict({ ...base, fetched: { sha: "abc1234", buildTime: "t", env: "preview" }, expectedSha: "abc1234" })).toBeNull();
  });
  it("returns a CRITICAL regression finding when deployed sha differs (stale/cached build)", () => {
    const f = bundleTruthVerdict({ ...base, fetched: { sha: "old0000", buildTime: "t", env: "preview" }, expectedSha: "new1111" });
    expect(f).not.toBeNull();
    expect(f!.dimension).toBe("regression");
    expect(f!.severity).toBe("critical");
    expect(f!.title).toMatch(/stale|bundle|sha/i);
    expect(f!.evidence).toContain("old0000");
    expect(f!.evidence).toContain("new1111");
    expect(f!.location).toEqual({ route: "/api/health" });
  });
  it("returns a HIGH finding when health is unreachable (fetched null)", () => {
    const f = bundleTruthVerdict({ ...base, fetched: null, expectedSha: "new1111" });
    expect(f!.severity).toBe("high");
    expect(f!.title).toMatch(/unreachable|health/i);
  });
  it("skips the check when expectedSha is empty (no SHA to compare)", () => {
    expect(bundleTruthVerdict({ ...base, fetched: { sha: "x", buildTime: "t", env: "preview" }, expectedSha: "" })).toBeNull();
  });
});
