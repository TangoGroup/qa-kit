import { type Finding, makeFindingId } from "../core/finding.js";

export type HealthInfo = { sha: string; buildTime: string; env: string };

// Compares the SHA baked into the DEPLOYED build (from /api/health) against the
// SHA we expected to ship. A mismatch means the alias points at a stale/cached
// build (the "Already up to date" / PWA stale-bundle trap) — critical regression.
export function bundleTruthVerdict(args: {
  app: string; runId: string; date: string; url: string;
  fetched: HealthInfo | null;
  expectedSha: string;
}): Finding | null {
  if (!args.expectedSha) return null; // nothing to compare against
  const location = { route: "/api/health" };
  const mk = (severity: Finding["severity"], title: string, evidence: string): Finding => ({
    id: makeFindingId({ app: args.app, dimension: "regression", title, location }),
    app: args.app, runId: args.runId, dimension: "regression", severity, title, location,
    evidence, repro: `GET ${args.url}/api/health`, verifiedBy: "deterministic", status: "confirmed",
    firstSeen: args.date, lastSeen: args.date,
  });
  // A missing fetch OR a blank/whitespace-only sha both mean "no usable build
  // info" — treat them the same (HIGH unreachable), never a stale-build critical.
  if (!args.fetched || !args.fetched.sha?.trim()) {
    return mk("high", "Deploy health endpoint unreachable", `GET ${args.url}/api/health returned no usable build info`);
  }
  // Normalize before comparing so case-only or whitespace-padded SHAs don't
  // produce false "stale build" criticals.
  const short = (s: string) => s.trim().toLowerCase().slice(0, 7);
  if (short(args.fetched.sha) !== short(args.expectedSha)) {
    return mk("critical", "Stale/cached deploy — bundle SHA mismatch",
      `deployed sha ${args.fetched.sha} != expected ${args.expectedSha} (alias may point at a cached build)`);
  }
  return null;
}

type PwSpec = { title: string; ok: boolean; file?: string };
type PwSuite = { title?: string; specs?: PwSpec[]; suites?: PwSuite[] };

function collectSpecs(suite: PwSuite): PwSpec[] {
  const here = suite.specs ?? [];
  const nested = (suite.suites ?? []).flatMap(collectSpecs);
  return [...here, ...nested];
}

export function roundtripResultsToFindings(args: {
  app: string; runId: string; date: string; report: unknown;
}): Finding[] {
  const root = (args.report ?? {}) as { suites?: PwSuite[] };
  const specs = (root.suites ?? []).flatMap(collectSpecs);
  return specs.filter((s) => s.ok === false).map((s) => {
    const location = s.file ? { file: s.file } : {};
    return {
      id: makeFindingId({ app: args.app, dimension: "regression", title: s.title, location }),
      app: args.app, runId: args.runId, dimension: "regression" as const, severity: "critical" as const,
      title: `round-trip failed: ${s.title}`, location,
      evidence: `Playwright spec failed against the deployed build`, repro: s.file ?? "(round-trip suite)",
      verifiedBy: "deterministic" as const, status: "confirmed" as const,
      firstSeen: args.date, lastSeen: args.date,
    };
  });
}
