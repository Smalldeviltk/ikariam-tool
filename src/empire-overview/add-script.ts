/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */

export function addScript(src) {
  var scr = document.createElement("script");
  scr.type = "text/javascript";
  scr.src = src;
  document.getElementsByTagName("body")[0].appendChild(scr);
}
