import { describe, it, expect } from "vitest";
import { makeFindingId, type Dimension } from "../finding.js";

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
  it("treats omitted location the same as an empty location object", () => {
    expect(makeFindingId({ app: "x", dimension: "perf", title: "t" })).toBe(
      makeFindingId({ app: "x", dimension: "perf", title: "t", location: {} }),
    );
  });
  it("is not vulnerable to delimiter injection across field boundaries", () => {
    // A field value containing the old "::" delimiter must not be able to shift
    // a field boundary so two logically-different findings hash to the same id.
    // Each pair below collides under a naive "::".join() but must NOT collide now.

    // title vs file boundary: "A::B" + file "C"  vs  "A" + file "B::C"
    const titleEatsFile = makeFindingId({ app: "x", dimension: "tenancy", title: "A::B", location: { file: "C" } });
    const fileGetsRest = makeFindingId({ app: "x", dimension: "tenancy", title: "A", location: { file: "B::C" } });
    expect(titleEatsFile).not.toBe(fileGetsRest);

    // app vs dimension boundary: app "x::tenancy"  vs  dimension "tenancy::perf"
    const appEatsDimension = makeFindingId({ app: "x::tenancy", dimension: "perf", title: "T" });
    const dimEatsApp = makeFindingId({ app: "x", dimension: "tenancy::perf" as Dimension, title: "T" });
    expect(appEatsDimension).not.toBe(dimEatsApp);

    // The plainly-different pair from the review still differs too.
    expect(makeFindingId({ app: "x", dimension: "tenancy", title: "X::Y" })).not.toBe(
      makeFindingId({ app: "x", dimension: "tenancy", title: "X", location: { file: "Y" } }),
    );
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
  it("orders the full 5-level severity ladder critical < high < medium < low < info", () => {
    const ladder = ["critical", "high", "medium", "low", "info"] as const;
    for (let i = 0; i < ladder.length - 1; i++) {
      expect(compareSeverity(ladder[i], ladder[i + 1])).toBeLessThan(0);
      expect(compareSeverity(ladder[i + 1], ladder[i])).toBeGreaterThan(0);
    }
    expect(compareSeverity("medium", "medium")).toBe(0);
  });
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
  it("collapses 3+ entries of the same id to the highest severity and widest seen range", () => {
    const out = dedupeFindings([
      mk({ id: "x", severity: "low", firstSeen: "2026-06-02", lastSeen: "2026-06-04" }),
      mk({ id: "x", severity: "high", firstSeen: "2026-06-03", lastSeen: "2026-06-03" }),
      mk({ id: "x", severity: "medium", firstSeen: "2026-06-01", lastSeen: "2026-06-05" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("high");
    expect(out[0].firstSeen).toBe("2026-06-01");
    expect(out[0].lastSeen).toBe("2026-06-05");
  });
  it("preserves all entries when every id is distinct", () => {
    const input = [mk({ id: "a" }), mk({ id: "b" }), mk({ id: "c" })];
    const out = dedupeFindings(input);
    expect(out).toHaveLength(3);
    expect(out.map((f) => f.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("score uses a free-form rubricKey, not the Dimension union", () => {
    const f: Finding = mk({ score: { value: 2, max: 5, weight: 1.5, rubricKey: "taskCompletion" } });
    expect(f.score?.rubricKey).toBe("taskCompletion");
  });
});

import { mkdtempSync, writeFileSync } from "node:fs";
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
  it("throws on an existing-but-malformed JSON file (corrupt findings fail loudly)", () => {
    const base = mkdtempSync(join(tmpdir(), "qa-"));
    const path = join(base, "corrupt.json");
    writeFileSync(path, "{ not valid json");
    expect(() => readFindings(path)).toThrow();
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
  it("returns [] for no verdicts", () => {
    expect(verdictsToFindings({ app: "a", runId: "r", date: "2026-06-03", verdicts: [] })).toEqual([]);
  });
  it("builds location with only defined keys so a write→read round-trip is deep-equal", () => {
    const out = verdictsToFindings({
      app: "a", runId: "r", date: "2026-06-03",
      verdicts: [{ site: "no-location", exploitable: true, severity: "high", reasoning: "x", twoTenantRepro: "y" }],
    });
    // No undefined keys leak in — JSON round-trip would otherwise drop them and break equality.
    expect(out[0].location).toEqual({});
    expect(Object.keys(out[0].location)).toEqual([]);

    const base = mkdtempSync(join(tmpdir(), "qa-"));
    const path = writeFindings(base, { date: "2026-06-03", runId: "r" }, out);
    expect(readFindings(path)).toEqual(out);
  });
});
