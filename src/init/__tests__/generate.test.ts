import { describe, it, expect } from "vitest";
import { renderQaConfig, QA_KIT_DEP, mergePackageJson, addTsconfigExclude } from "../generate.js";

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

describe("mergePackageJson", () => {
  it("adds qa-kit as an optionalDependency (idempotent, preserves existing)", () => {
    const out = mergePackageJson({ name: "x", dependencies: { next: "^15" } });
    expect(out.optionalDependencies["qa-kit"]).toBe("github:TangoGroup/qa-kit#main");
    expect(out.dependencies.next).toBe("^15");
  });
  it("does not overwrite an existing qa-kit dep (e.g. a link: for co-dev)", () => {
    const out = mergePackageJson({ name: "x", optionalDependencies: { "qa-kit": "link:../qa-kit" } });
    expect(out.optionalDependencies["qa-kit"]).toBe("link:../qa-kit");
  });
});

describe("addTsconfigExclude", () => {
  it("adds qa.config.ts to exclude (creating the array if absent)", () => {
    expect(addTsconfigExclude({ compilerOptions: {} }).exclude).toEqual(["qa.config.ts"]);
  });
  it("appends without duplicating or dropping existing entries", () => {
    const out = addTsconfigExclude({ exclude: ["node_modules"] });
    expect(out.exclude).toEqual(["node_modules", "qa.config.ts"]);
    expect(addTsconfigExclude(out).exclude).toEqual(["node_modules", "qa.config.ts"]); // idempotent
  });
});
