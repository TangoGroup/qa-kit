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
  if (!args.fetched) return mk("high", "Deploy health endpoint unreachable", `GET ${args.url}/api/health returned no usable build info`);
  const short = (s: string) => s.slice(0, 7);
  if (short(args.fetched.sha) !== short(args.expectedSha)) {
    return mk("critical", "Stale/cached deploy — bundle SHA mismatch",
      `deployed sha ${args.fetched.sha} != expected ${args.expectedSha} (alias may point at a cached build)`);
  }
  return null;
}
