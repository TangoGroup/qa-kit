import { describe, it, expect } from "vitest";
import { makeFindingId } from "../finding.js";

describe("makeFindingId", () => {
  it("is stable across runs for the same logical finding", () => {
    const base = { app: "student-data", dimension: "tenancy" as const, title: "Calendar IDOR", location: { file: "app/api/calendar/[campusId]/route.ts", line: 16 } };
    expect(makeFindingId(base)).toBe(makeFindingId({ ...base }));
  });
  it("differs when file/line/title/app/dimension differ", () => {
    const a = makeFindingId({ app: "x", dimension: "tenancy", title: "T", location: { file: "f", line: 1 } });
    const b = makeFindingId({ app: "x", dimension: "tenancy", title: "T", location: { file: "f", line: 2 } });
    expect(a).not.toBe(b);
  });
  it("returns a 16-char hex id", () => {
    expect(makeFindingId({ app: "x", dimension: "perf", title: "t" })).toMatch(/^[0-9a-f]{16}$/);
  });
});

import { compareSeverity, dedupeFindings, type Finding } from "../finding.js";

const mk = (over: Partial<Finding>): Finding => ({
  id: "id1", app: "a", runId: "r", dimension: "tenancy", severity: "high",
  title: "t", location: {}, evidence: "", repro: "", verifiedBy: "single",
  status: "confirmed", firstSeen: "2026-06-01", lastSeen: "2026-06-01", ...over,
});

describe("compareSeverity", () => {
  it("orders critical before low", () => { expect(compareSeverity("critical", "low")).toBeLessThan(0); });
});

describe("dedupeFindings", () => {
  it("collapses same id, keeps higher severity, widens seen range", () => {
    const out = dedupeFindings([
      mk({ id: "x", severity: "medium", firstSeen: "2026-06-02", lastSeen: "2026-06-02" }),
      mk({ id: "x", severity: "critical", firstSeen: "2026-06-01", lastSeen: "2026-06-03" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("critical");
    expect(out[0].firstSeen).toBe("2026-06-01");
    expect(out[0].lastSeen).toBe("2026-06-03");
  });
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFindings, readFindings } from "../finding.js";

describe("findings IO", () => {
  it("writes to <baseDir>/<date>/<runId>.json and reads back", () => {
    const base = mkdtempSync(join(tmpdir(), "qa-"));
    const f = mk({ id: "z" });
    const path = writeFindings(base, { date: "2026-06-03", runId: "run42" }, [f]);
    expect(path).toContain(join("2026-06-03", "run42.json"));
    expect(readFindings(path)).toEqual([f]);
  });
  it("returns [] for a missing path", () => {
    expect(readFindings("/nope/missing.json")).toEqual([]);
  });
});

import { verdictsToFindings } from "../finding.js";

describe("verdictsToFindings", () => {
  const verdicts = [
    { site: "calendar GET", file: "app/api/calendar/[campusId]/route.ts", line: 16, exploitable: true, severity: "critical", reasoning: "no access check", twoTenantRepro: "loginAs(jake) GET other campus", suggestedFix: "add assertCampusAccess before line 17" },
    { site: "removeTeamMember", file: "team/actions.ts", line: 305, exploitable: false, severity: "low", reasoning: "gated", twoTenantRepro: "n/a", suggestedFix: "n/a" },
  ] as const;
  it("maps exploitable→confirmed and non-exploitable→refuted, stamps ids + seen dates", () => {
    const out = verdictsToFindings({ app: "student-data", runId: "r1", date: "2026-06-03", verdicts });
    expect(out).toHaveLength(2);
    const crit = out.find((f) => f.severity === "critical")!;
    expect(crit.dimension).toBe("tenancy");
    expect(crit.status).toBe("confirmed");
    expect(crit.verifiedBy).toBe("adversarial");
    expect(crit.id).toMatch(/^[0-9a-f]{16}$/);
    expect(crit.firstSeen).toBe("2026-06-03");
    expect(out.find((f) => f.severity === "low")!.status).toBe("refuted");
  });
});
