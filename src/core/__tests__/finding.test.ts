import { describe, it, expect } from "vitest";
import { makeFindingId } from "../finding.js";

describe("makeFindingId", () => {
  it("is stable across runs for the same logical finding", () => {
    const base = { app: "student-data", dimension: "tenancy" as const, title: "Calendar IDOR", location: { file: "app/api/calendar/[campusId]/route.ts", line: 16 } };
    expect(makeFindingId(base)).toBe(makeFindingId({ ...base }));
  });
  it("differs when file/line/title/app/dimension differ", () => {
    const a = makeFindingId({ app: "x", dimension: "tenancy", title: "T", location: { file: "f", line: 1 } });
    const b = makeFindingId({ app: "x", dimension: "tenancy", title: "T", location: { file: "f", line: 2 } });
    expect(a).not.toBe(b);
  });
  it("returns a 16-char hex id", () => {
    expect(makeFindingId({ app: "x", dimension: "perf", title: "t" })).toMatch(/^[0-9a-f]{16}$/);
  });
});
