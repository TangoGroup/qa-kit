import type { Severity } from "../core/finding.js";

// Sensitivity tiers for contact fields leaked across the role lattice.
const CRITICAL = new Set(["isDonor", "isAlumni", "source", "sourceDetail", "smsConsent", "smsConsentDate", "emailConsent", "emailConsentDate"]);
const HIGH = new Set(["ethnicity", "internationalStudent", "preferredLanguage", "continuumStage", "graduationYear", "isReturning", "timesReturned"]);
const MEDIUM = new Set(["phone", "email", "residence", "gender", "major", "year", "instagramHandle", "firstContactedAt"]);
const LOW = new Set(["createdAt", "updatedAt", "tags", "notes", "pathwayStage", "followUpStatus", "firstName", "lastName"]);

export function classifyFieldSeverity(field: string): Severity {
  if (CRITICAL.has(field)) return "critical";
  if (HIGH.has(field)) return "high";
  if (MEDIUM.has(field)) return "medium";
  if (LOW.has(field)) return "low";
  return "medium"; // unknown → safe default (don't under-rate an unrecognized field)
}
