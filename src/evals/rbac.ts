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
    if (!nSet || !bSet || isUniversal(nSet) || isUniversal(bSet)) continue; // universal broader = covers all; universal narrower handled by config check elsewhere
    const broaderHas = new Set(bSet);
    for (const field of nSet) {
      if (broaderHas.has(field)) continue;
      const severity = classifyFieldSeverity(field);
      const title = `${args.kind} field "${field}" exposed to narrower role but not broader`;
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
