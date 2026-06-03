import { describe, it, expect } from "vitest";
import { defineQAConfig, type QAConfig } from "../config.js";

const valid: QAConfig = {
  app: { name: "student-data", repo: "gloo/student-data" },
  tenancy: { key: "campusId", accessHelper: "assertCampusAccess" },
  personas: { matrix: ["campus_staff", "student_leader"] },
  envs: { staging: { baseUrl: "https://staging.example.com" } },
  findings: { dir: "qa-testing/findings" },
};

describe("defineQAConfig", () => {
  it("returns a frozen config with surface defaults applied", () => {
    const cfg = defineQAConfig(valid);
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(cfg.surface?.apiRoutes).toBe("app/api/**/route.ts");
    expect(cfg.surface?.publicRoutes).toEqual([]);
  });
  it("does not clobber a provided surface", () => {
    const cfg = defineQAConfig({ ...valid, surface: { publicRoutes: ["app/api/auth/**"] } });
    expect(cfg.surface?.publicRoutes).toEqual(["app/api/auth/**"]);
  });
  it.each([
    ["app.name", { ...valid, app: { name: "", repo: "r" } }],
    ["tenancy.key", { ...valid, tenancy: { key: "", accessHelper: "h" } }],
    ["tenancy.accessHelper", { ...valid, tenancy: { key: "k", accessHelper: "" } }],
    ["personas.matrix", { ...valid, personas: { matrix: [] } }],
    ["findings.dir", { ...valid, findings: { dir: "" } }],
  ])("throws when %s is missing", (_label, bad) => {
    expect(() => defineQAConfig(bad as QAConfig)).toThrow();
  });
});
