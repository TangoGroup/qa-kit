import { describe, it, expect } from "vitest";
import { summarizeFindings } from "../summary.js";
import { SEVERITIES, type Finding } from "../finding.js";

const mk = (over: Partial<Finding>): Finding => ({
  id: "id1", app: "a", runId: "r", dimension: "tenancy", severity: "high",
  title: "t", location: {}, evidence: "", repro: "", verifiedBy: "single",
  status: "confirmed", firstSeen: "2026-06-04", lastSeen: "2026-06-04", ...over,
});

describe("summarizeFindings", () => {
  it("dedups same-id findings (keeping the higher severity) before counting", () => {
    const out = summarizeFindings([
      mk({ id: "x", severity: "medium" }),
      mk({ id: "x", severity: "critical" }),
    ]);
    expect(out.total).toBe(1);
    expect(out.ranked).toHaveLength(1);
    expect(out.ranked[0].severity).toBe("critical");
    expect(out.totals.critical).toBe(1);
    expect(out.totals.medium).toBe(0);
  });

  it("ranks critical-first across the full severity ladder", () => {
    const out = summarizeFindings([
      mk({ id: "low", severity: "low" }),
      mk({ id: "info", severity: "info" }),
      mk({ id: "crit", severity: "critical" }),
      mk({ id: "med", severity: "medium" }),
      mk({ id: "high", severity: "high" }),
    ]);
    expect(out.ranked.map((f) => f.severity)).toEqual([
      "critical", "high", "medium", "low", "info",
    ]);
  });

  it("counts byDimension per dimension × severity (deduped)", () => {
    const out = summarizeFindings([
      mk({ id: "t1", dimension: "tenancy", severity: "critical" }),
      mk({ id: "t2", dimension: "tenancy", severity: "high" }),
      mk({ id: "r1", dimension: "rbac", severity: "high" }),
      mk({ id: "r1-dup", dimension: "rbac", severity: "high" }),
      mk({ id: "a1", dimension: "a11y", severity: "medium" }),
    ]);
    expect(out.byDimension.tenancy.critical).toBe(1);
    expect(out.byDimension.tenancy.high).toBe(1);
    expect(out.byDimension.rbac.high).toBe(2);
    expect(out.byDimension.a11y.medium).toBe(1);
    // dimensions present do not leak severities they don't have
    expect(out.byDimension.a11y.critical ?? 0).toBe(0);
  });

  it("collapses a same-id duplicate inside byDimension counts", () => {
    const out = summarizeFindings([
      mk({ id: "dupe", dimension: "rbac", severity: "high" }),
      mk({ id: "dupe", dimension: "rbac", severity: "high" }),
    ]);
    expect(out.byDimension.rbac.high).toBe(1);
    expect(out.total).toBe(1);
  });

  it("totals has an entry for every severity, including zeros for absent ones", () => {
    const out = summarizeFindings([mk({ id: "c", severity: "critical" })]);
    for (const sev of SEVERITIES) {
      expect(out.totals[sev]).toBeTypeOf("number");
    }
    expect(out.totals.critical).toBe(1);
    expect(out.totals.high).toBe(0);
    expect(out.totals.medium).toBe(0);
    expect(out.totals.low).toBe(0);
    expect(out.totals.info).toBe(0);
  });

  it("empty input → all zero totals, no dimensions, empty ranked", () => {
    const out = summarizeFindings([]);
    expect(out.total).toBe(0);
    expect(out.ranked).toEqual([]);
    expect(out.byDimension).toEqual({});
    for (const sev of SEVERITIES) {
      expect(out.totals[sev]).toBe(0);
    }
  });
});
