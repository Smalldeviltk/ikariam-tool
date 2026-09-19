/**
 * Send Resources — userscript entry.
 *
 * The `@exclude` lines in the userscript header already keep this off the island
 * and world-map views, so no runtime filtering is needed here. The Chrome
 * extension entry adds that check itself.
 */
import { setBuildInfo } from "@core/bug-report";
import { start } from "./app";

setBuildInfo({
  packaging: __PACKAGING__,
  script: "send-resources",
  version: __SCRIPT_VERSION__,
});

// The game renders its DOM late; wait for the document before starting.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
