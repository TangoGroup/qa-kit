import { describe, it, expect } from "vitest";
import { isAuditFalsePositive, auditFindingsToFindings } from "../a11y.js";

describe("isAuditFalsePositive", () => {
  it("drops sr-only / visually-hidden / aria-hidden + 1xN tap targets", () => {
    expect(isAuditFalsePositive({ kind: "small-tap-target", selector: "a.sr-only", detail: "" })).toBe(true);
    expect(isAuditFalsePositive({ kind: "small-tap-target", selector: "button", detail: "1×24px" })).toBe(true);
    expect(isAuditFalsePositive({ kind: "no-accessible-name", selector: "[aria-hidden='true']", detail: "" })).toBe(true);
    expect(isAuditFalsePositive({ kind: "horizontal-scroll", selector: "main", detail: "scrollWidth 500" })).toBe(false);
  });
});

describe("auditFindingsToFindings", () => {
  const blockOn = { "horizontal-scroll": "high", "small-tap-target": "medium" } as const;
  it("maps kind→severity, sets dimension a11y + verifiedBy deterministic, dedups, drops FPs", () => {
    const out = auditFindingsToFindings({
      app: "student-data", runId: "r1", date: "2026-06-03",
      blockOn, defaultSeverity: "medium",
      audit: [
        { route: "/home", kind: "horizontal-scroll", selector: "main", detail: "scrollWidth 500" },
        { route: "/home", kind: "horizontal-scroll", selector: "main", detail: "scrollWidth 500" }, // dup
        { route: "/home", kind: "small-tap-target", selector: "a.sr-only", detail: "" }, // FP
        { route: "/people", kind: "no-accessible-name", selector: "button", detail: "icon btn" }, // default sev
      ],
    });
    expect(out).toHaveLength(2);
    const hs = out.find((f) => f.title === "horizontal-scroll")!;
    expect(hs).toMatchObject({ dimension: "a11y", severity: "high", verifiedBy: "deterministic", status: "confirmed" });
    expect(hs.location).toEqual({ route: "/home" });
    expect(hs.score).toBeUndefined();
    expect(out.find((f) => f.title === "no-accessible-name")!.severity).toBe("medium"); // default
  });
});
