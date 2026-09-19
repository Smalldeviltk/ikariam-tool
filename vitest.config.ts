import { defineConfig } from "vitest/config";
import { alias } from "./build/shared";

export default defineConfig({
  resolve: { alias },
  // The build stamps these in; the startup smoke test evaluates `main.ts`
  // directly, so they must exist here too.
  define: {
    __SCRIPT_VERSION__: JSON.stringify("0.0.0-test"),
    __PACKAGING__: JSON.stringify("userscript"),
  },
  test: {
    // The userscripts are browser code: `window`, `document` and `localStorage`
    // must exist for the units under test. happy-dom is used over jsdom purely
    // because it starts faster.
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
    restoreMocks: true,
  },
});
