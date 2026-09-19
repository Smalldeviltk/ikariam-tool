/**
 * Page-world entry for Send Resources, used by the Chrome extension build.
 *
 * The feature code itself is unchanged between packagings — it already runs in
 * page context under `@grant none`, which is the same world an injected
 * `<script>` lands in. The only difference is the view filter: the userscript
 * gets that from its `@exclude` header lines, which Chrome cannot express.
 */
import { setBuildInfo } from "@core/bug-report";
import { start } from "@send/app";
import { shouldRunHere } from "./view-guard";

setBuildInfo({
  packaging: __PACKAGING__,
  script: "send-resources",
  version: __SCRIPT_VERSION__,
});

if (shouldRunHere()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
