import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against a mistake that already shipped once.
 *
 * `page-empire-overview.ts` originally announced its packaging with a statement
 * placed above `import "@empire/main"`. ES module imports are HOISTED, so the
 * feature code evaluated first and stamped itself as a userscript; the
 * extension's own call then found the flag already set and did nothing. Every
 * bug report from the extension build was mislabelled.
 *
 * The packaging is a build-time constant now. These tests assert the entries
 * do not drift back to announcing it at runtime.
 */
function entrySource(name: string): string {
  return readFileSync(resolve(__dirname, name), "utf8");
}

describe("extension entries", () => {
  it("page-empire-overview does not call installEmpireDiagnostics itself", () => {
    // Any such call is hoisted past and therefore dead.
    expect(entrySource("page-empire-overview.ts")).not.toMatch(
      /installEmpireDiagnostics\s*\(/,
    );
  });

  it("page-empire-overview imports the shims before the feature code", () => {
    const source = entrySource("page-empire-overview.ts");
    expect(source.indexOf('import "./gm-shim"')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('import "./gm-shim"')).toBeLessThan(
      source.indexOf('import "@empire/main"'),
    );
  });

  it("no entry hard-codes a packaging string", () => {
    for (const name of ["page-empire-overview.ts", "page-send-resources.ts"]) {
      const source = entrySource(name);
      expect(source).not.toMatch(/packaging:\s*"(userscript|extension)"/);
    }
  });

  it("page-send-resources keeps its runtime view filter", () => {
    // This one IS a runtime decision — Chrome match patterns cannot see the
    // query string, so `?view=island` has to be excluded here.
    expect(entrySource("page-send-resources.ts")).toMatch(/shouldRunHere\s*\(/);
  });
});
