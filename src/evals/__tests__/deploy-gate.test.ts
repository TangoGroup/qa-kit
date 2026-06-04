import { describe, it, expect } from "vitest";
import { bundleTruthVerdict } from "../deploy-gate.js";
import { roundtripResultsToFindings } from "../deploy-gate.js";

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
  it("normalizes case + whitespace before comparing (no false stale criticals)", () => {
    // case-only difference is a MATCH
    expect(bundleTruthVerdict({ ...base, fetched: { sha: "ABC1234", buildTime: "t", env: "preview" }, expectedSha: "abc1234" })).toBeNull();
    // leading-space difference is a MATCH
    expect(bundleTruthVerdict({ ...base, fetched: { sha: " abc1234", buildTime: "t", env: "preview" }, expectedSha: "abc1234" })).toBeNull();
  });
  it("treats a blank deployed sha as unreachable (HIGH), not a mismatch", () => {
    const f = bundleTruthVerdict({ ...base, fetched: { sha: "", buildTime: "t", env: "preview" }, expectedSha: "new1111" });
    expect(f!.severity).toBe("high");
    expect(f!.title).toMatch(/unreachable|health/i);
  });
  it("treats sub-7-char shas correctly (slice(0,7) is safe)", () => {
    const f = bundleTruthVerdict({ ...base, fetched: { sha: "abc", buildTime: "t", env: "preview" }, expectedSha: "abc1234" });
    expect(f!.severity).toBe("critical");
    expect(f!.title).toMatch(/stale|bundle|sha/i);
  });
});

describe("roundtripResultsToFindings", () => {
  // Minimal shape of Playwright's JSON reporter: suites[].specs[].{title, ok, file?}
  const report = {
    suites: [{
      title: "roundtrip-jake",
      specs: [
        { title: "logs and archives a contact", ok: true, file: "e2e/roundtrip/jake.spec.ts" },
        { title: "follow-up appears in queue", ok: false, file: "e2e/roundtrip/jake.spec.ts" },
      ],
    }],
  };
  it("emits one critical regression finding per FAILED spec only", () => {
    const out = roundtripResultsToFindings({ app: "student-data", runId: "r1", date: "2026-06-04", report });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dimension: "regression", severity: "critical", verifiedBy: "deterministic" });
    expect(out[0].title).toContain("follow-up appears in queue");
    expect(out[0].location).toEqual({ file: "e2e/roundtrip/jake.spec.ts" });
  });
  it("returns [] when all specs pass", () => {
    const ok = { suites: [{ title: "rt", specs: [{ title: "a", ok: true }] }] };
    expect(roundtripResultsToFindings({ app: "a", runId: "r", date: "d", report: ok })).toEqual([]);
  });
  it("tolerates a missing/empty report", () => {
    expect(roundtripResultsToFindings({ app: "a", runId: "r", date: "d", report: {} })).toEqual([]);
    expect(roundtripResultsToFindings({ app: "a", runId: "r", date: "d", report: null })).toEqual([]);
  });
  it("recurses into nested suites (suites[].suites[])", () => {
    const nested = {
      suites: [{
        title: "outer",
        suites: [{
          title: "inner",
          specs: [{ title: "deep spec", ok: false, file: "e2e/x.spec.ts" }],
        }],
      }],
    };
    const out = roundtripResultsToFindings({ app: "student-data", runId: "r1", date: "2026-06-04", report: nested });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dimension: "regression", severity: "critical", verifiedBy: "deterministic" });
    expect(out[0].title).toContain("deep spec");
    expect(out[0].location).toEqual({ file: "e2e/x.spec.ts" });
  });
});
