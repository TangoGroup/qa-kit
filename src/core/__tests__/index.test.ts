import { describe, it, expect } from "vitest";
import * as core from "../index.js";

describe("core barrel", () => {
  it("re-exports the public surface", () => {
    for (const name of ["defineQAConfig", "makeFindingId", "compareSeverity", "dedupeFindings", "writeFindings", "readFindings", "verdictsToFindings"]) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
