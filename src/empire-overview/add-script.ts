/* eslint-disable */
/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */

export function addScript(src) {
  var script = document.createElement("script");
  script.type = "text/javascript";
  script.src = src;
  document.getElementsByTagName("body")[0].appendChild(script);
}
