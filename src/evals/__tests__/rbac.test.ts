import { describe, it, expect } from "vitest";
import { latticeViolations, UNIVERSAL } from "../rbac.js";
import { classifyFieldSeverity } from "../rbac-severity.js";

// hierarchy narrowest→broadest; "*" (UNIVERSAL) = all fields
const hierarchy = ["student_leader", "campus_staff", "area_director"];

describe("latticeViolations", () => {
  it("returns [] when narrower is a strict subset of broader (and * is universal)", () => {
    const v = latticeViolations({
      app: "student-data", runId: "r1", date: "2026-06-04", kind: "visible", hierarchy,
      fieldSetsByRole: {
        student_leader: ["firstName", "email"],
        campus_staff: UNIVERSAL,   // ["*"]
        area_director: UNIVERSAL,
      },
    });
    expect(v).toEqual([]);
  });
  it("flags a field a NARROWER role has that the adjacent BROADER role lacks", () => {
    const v = latticeViolations({
      app: "student-data", runId: "r1", date: "2026-06-04", kind: "visible", hierarchy,
      fieldSetsByRole: {
        student_leader: ["firstName", "isDonor"],   // isDonor not in campus_staff's (non-universal) set
        campus_staff: ["firstName"],
        area_director: ["firstName"],
      },
    });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ dimension: "rbac", verifiedBy: "deterministic", status: "confirmed" });
    expect(v[0].title).toContain("isDonor");
    expect(v[0].title).toContain("student_leader");
    expect(v[0].title).toContain("campus_staff");
    expect(v[0].evidence).toContain("student_leader");
    expect(v[0].evidence).toContain("campus_staff");
    expect(v[0].location).toEqual({ persona: "student_leader" });
  });
  it("flags a UNIVERSAL narrower with a restricted broader as a critical lattice inversion", () => {
    const v = latticeViolations({
      app: "student-data", runId: "r1", date: "2026-06-04", kind: "visible",
      hierarchy: ["student_leader", "campus_staff"],
      fieldSetsByRole: {
        student_leader: UNIVERSAL,        // narrowest role sees EVERYTHING
        campus_staff: ["firstName"],      // broader role is restricted
      },
    });
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("critical");
    expect(v[0].title).toMatch(/inversion/i);
    expect(v[0].title).toContain("student_leader");
    expect(v[0].title).toContain("campus_staff");
    expect(v[0].location).toEqual({ persona: "student_leader" });
    expect(v[0]).toMatchObject({ dimension: "rbac", verifiedBy: "deterministic", status: "confirmed" });
  });
  it("gives the SAME leaked field on DIFFERENT role pairs DISTINCT ids", () => {
    // Two distinct narrower→broader pairs each leak the SAME field (isDonor),
    // with DIFFERENT narrower roles (student_leader and area_director).
    // Without role identity in the title, both would hash to the same id (the
    // finding-id excludes location.persona) and dedupeFindings would drop one.
    const v = latticeViolations({
      app: "student-data", runId: "r1", date: "2026-06-04", kind: "visible",
      hierarchy: ["student_leader", "campus_staff", "area_director", "regional_director"],
      fieldSetsByRole: {
        student_leader: ["isDonor"],     // leaks isDonor vs campus_staff
        campus_staff: [],
        area_director: ["isDonor"],      // leaks isDonor vs regional_director
        regional_director: [],
      },
    });
    const donorFindings = v.filter((f) => f.title.includes("isDonor"));
    expect(donorFindings).toHaveLength(2);
    expect(donorFindings[0].id).not.toEqual(donorFindings[1].id);
  });
  it("dedupes duplicate fields in the narrower set (no duplicate findings)", () => {
    const v = latticeViolations({
      app: "student-data", runId: "r1", date: "2026-06-04", kind: "visible",
      hierarchy: ["student_leader", "campus_staff"],
      fieldSetsByRole: {
        student_leader: ["isDonor", "isDonor", "isDonor"],
        campus_staff: [],
      },
    });
    expect(v).toHaveLength(1);
  });
  it("treats UNIVERSAL broader as covering everything (no violation)", () => {
    const v = latticeViolations({
      app: "a", runId: "r", date: "d", kind: "editable", hierarchy: ["student_leader", "campus_staff"],
      fieldSetsByRole: { student_leader: ["x", "y", "z"], campus_staff: UNIVERSAL },
    });
    expect(v).toEqual([]);
  });
  it("escalates severity for sensitive leaked fields (isDonor → critical)", () => {
    const v = latticeViolations({
      app: "a", runId: "r", date: "d", kind: "visible", hierarchy: ["student_leader", "campus_staff"],
      fieldSetsByRole: { student_leader: ["isDonor"], campus_staff: [] },
    });
    expect(v[0].severity).toBe("critical");
  });
});

describe("classifyFieldSeverity", () => {
  it("donor/consent/PII → critical", () => {
    for (const f of ["isDonor", "smsConsent", "emailConsentDate", "source"]) expect(classifyFieldSeverity(f)).toBe("critical");
  });
  it("demographic → high", () => {
    for (const f of ["ethnicity", "internationalStudent", "preferredLanguage"]) expect(classifyFieldSeverity(f)).toBe("high");
  });
  it("identity contact fields → medium", () => {
    for (const f of ["phone", "email"]) expect(classifyFieldSeverity(f)).toBe("medium");
  });
  it("cosmetic/timestamps → low", () => {
    for (const f of ["createdAt", "updatedAt", "tags"]) expect(classifyFieldSeverity(f)).toBe("low");
  });
  it("unknown field → medium (safe default)", () => {
    expect(classifyFieldSeverity("somethingNew")).toBe("medium");
  });
});
