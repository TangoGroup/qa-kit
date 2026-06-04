import { describe, it, expect } from "vitest";
import { renderQaConfig, QA_KIT_DEP } from "../generate.js";

describe("renderQaConfig", () => {
  const cfg = renderQaConfig({
    appName: "acme-app", repo: "TangoGroup/acme-app",
    actions: "app/**/actions.ts", apiRoutes: "app/api/**/route.ts",
    publicRoutes: ["app/api/auth/**"],
  });
  it("imports defineQAConfig from qa-kit/core and default-exports it", () => {
    expect(cfg).toContain('import { defineQAConfig } from "qa-kit/core"');
    expect(cfg).toContain("export default defineQAConfig(");
  });
  it("fills app-derivable fields", () => {
    expect(cfg).toContain('name: "acme-app"');
    expect(cfg).toContain('repo: "TangoGroup/acme-app"');
    expect(cfg).toContain('actions: "app/**/actions.ts"');
    expect(cfg).toContain('"app/api/auth/**"');
  });
  it("emits TODO placeholders for human-only fields (still non-empty so defineQAConfig validates)", () => {
    expect(cfg).toMatch(/key: "TODO_/);          // tenancy.key
    expect(cfg).toMatch(/accessHelper: "TODO_/); // tenancy.accessHelper
    expect(cfg).toMatch(/matrix: \[/);
    expect(cfg).toContain("TODO");                // visible markers
  });
});

describe("QA_KIT_DEP", () => {
  it("is the public github spec (resolves anywhere, no sibling clone)", () => {
    expect(QA_KIT_DEP).toBe("github:TangoGroup/qa-kit#main");
  });
});
