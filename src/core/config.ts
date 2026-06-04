export type TenancyConfig = { key: string; scopeHierarchy?: string[]; accessHelper: string; bypassRoles?: string[] };
export type PersonasConfig = { source?: string; loginAs?: string; matrix: string[]; roleMap?: Record<string, string> };
export type EnvConfig = { baseUrl: string; readOnly?: boolean };
export type SurfaceConfig = { actions?: string; apiRoutes?: string; publicRoutes?: string[] };
export type RubricsConfig = {
  visual?: { baselineDir: string; maxDiffPixelRatio?: number; aiReview?: boolean };
  persona?: { dimensions: { key: string; weight: number; max?: number }[]; passThreshold?: number; flows?: string[] };
  // blockOn maps an audit finding kind (e.g. "horizontal-scroll", "small-tap-target")
  // to a Finding severity; auditFindingsToFindings reads blockOn[kind].
  a11y?: { minTapTargetPx?: number; blockOn?: Record<string, string> };
  perf?: { lcpMs?: number; inpMs?: number; cls?: number };
};
export type QAConfig = {
  app: { name: string; repo: string };
  repoRoot?: string;
  qaKitVersion?: string;
  tenancy: TenancyConfig;
  personas: PersonasConfig;
  envs: Record<string, EnvConfig>;
  surface?: SurfaceConfig;
  rbac?: { fieldVisibility?: string };
  rubrics?: RubricsConfig;
  commands?: Record<string, string>;
  findings: { dir: string; githubLabels?: string[]; dashboard?: { enabled: boolean; endpoint?: string } };
};

const DEFAULT_SURFACE: Required<SurfaceConfig> = {
  actions: "app/**/actions.ts",
  apiRoutes: "app/api/**/route.ts",
  publicRoutes: [],
};

export function defineQAConfig(input: QAConfig): QAConfig {
  if (!input.app?.name) throw new Error("qa.config: app.name is required");
  if (!input.tenancy?.key) throw new Error("qa.config: tenancy.key is required");
  if (!input.tenancy?.accessHelper) throw new Error("qa.config: tenancy.accessHelper is required");
  if (!input.personas?.matrix?.length) throw new Error("qa.config: personas.matrix must be non-empty");
  if (!input.findings?.dir) throw new Error("qa.config: findings.dir is required");
  return Object.freeze({ ...input, surface: { ...DEFAULT_SURFACE, ...(input.surface ?? {}) } });
}
