import { type Finding, makeFindingId } from "../core/finding.js";
import { classifyFieldSeverity } from "./rbac-severity.js";

export const UNIVERSAL = ["*"] as const;
const isUniversal = (set: readonly string[]) => set.length === 1 && set[0] === "*";

export function latticeViolations(args: {
  app: string; runId: string; date: string;
  kind: "visible" | "editable";
  hierarchy: string[];                       // narrowest → broadest
  fieldSetsByRole: Record<string, readonly string[]>;
}): Finding[] {
  const out: Finding[] = [];
  // For each adjacent (narrower, broader) pair, every field the narrower role has
  // must also be present in the broader role's set (UNIVERSAL covers all).
  for (let i = 0; i < args.hierarchy.length - 1; i++) {
    const narrower = args.hierarchy[i];
    const broader = args.hierarchy[i + 1];
    const nSet = args.fieldSetsByRole[narrower];
    const bSet = args.fieldSetsByRole[broader];
    if (!nSet || !bSet || isUniversal(bSet)) continue; // missing set, or broader covers all → genuinely no violation
    if (isUniversal(nSet)) {
      // UNIVERSAL narrower with a RESTRICTED broader: the narrowest role sees
      // everything while a broader role is restricted — the worst lattice
      // inversion. Emit one critical finding (every field leaks) and move on.
      const title = `${args.kind} fields: narrower role ${narrower} sees ALL fields but broader ${broader} is restricted (lattice inversion)`;
      const location = { persona: narrower };
      out.push({
        id: makeFindingId({ app: args.app, dimension: "rbac", title, location }),
        app: args.app, runId: args.runId, dimension: "rbac", severity: "critical", title, location,
        evidence: `${narrower} can ${args.kind === "visible" ? "view" : "edit"} ALL fields (["*"]) while the adjacent broader role ${broader} is restricted to a finite set — inverts the role subset lattice`,
        repro: `compare ${args.kind} field sets of ${narrower} vs ${broader} from the oracle`,
        verifiedBy: "deterministic", status: "confirmed",
        firstSeen: args.date, lastSeen: args.date,
      });
      continue;
    }
    const broaderHas = new Set(bSet);
    for (const field of new Set(nSet)) {
      if (broaderHas.has(field)) continue;
      const severity = classifyFieldSeverity(field);
      const title = `${args.kind} field "${field}" exposed to ${narrower} but not broader ${broader}`;
      const location = { persona: narrower };
      out.push({
        id: makeFindingId({ app: args.app, dimension: "rbac", title, location }),
        app: args.app, runId: args.runId, dimension: "rbac", severity, title, location,
        evidence: `${narrower} can ${args.kind === "visible" ? "view" : "edit"} "${field}" which the adjacent broader role ${broader} cannot — breaks the role subset lattice`,
        repro: `compare ${args.kind} field sets of ${narrower} vs ${broader} from the oracle`,
        verifiedBy: "deterministic", status: "confirmed",
        firstSeen: args.date, lastSeen: args.date,
      });
    }
  }
  return out;
}
