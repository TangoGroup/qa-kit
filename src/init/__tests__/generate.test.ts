import { describe, it, expect } from "vitest";
import { renderQaConfig, QA_KIT_DEP, mergePackageJson, addTsconfigExclude, renderCiCaller } from "../generate.js";

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

describe("renderCiCaller", () => {
  const yml = renderCiCaller();
  it("calls the reusable qa-gate workflow on deployment_status + workflow_dispatch", () => {
    expect(yml).toContain("uses: TangoGroup/qa-kit/.github/workflows/qa-gate.yml@main");
    expect(yml).toContain("deployment_status:");
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toContain("deployed_url:");
    expect(yml).toContain("expected_sha:");
    expect(yml).toContain("anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}");
  });
  it("defaults the preview-host guard but allows overriding", () => {
    expect(yml).toContain("preview.gloo.us");
    expect(renderCiCaller({ previewHostMatch: "vercel.app" })).toContain("vercel.app");
  });
});
