// Run with: node frontend/scripts/test-onboarding.mjs
import { guessLanguage, pickSuggestions } from "../src/config/onboarding.js";

let failed = 0;
const check = (label, condition) => {
  if (condition) console.log(`  ok  - ${label}`);
  else {
    failed += 1;
    console.error(`  FAIL - ${label}`);
  }
};

const codes = ["en-US", "es-MX", "es-ES", "fr-FR", "pt-BR", "zh-CN", "ne-NP"];

console.log("guessLanguage");
check("exact match wins", guessLanguage(["es-ES", "en-US"], codes) === "es-ES");
check("exact match ignores case", guessLanguage(["FR-fr"], codes) === "fr-FR");
check("same base language picks the first option", guessLanguage(["es-AR"], codes) === "es-MX");
check("bare language code works", guessLanguage(["pt"], codes) === "pt-BR");
check("respects the browser's order", guessLanguage(["ne", "en-US"], codes) === "ne-NP");
check("skips unsupported and falls to the next", guessLanguage(["xx-YY", "fr"], codes) === "fr-FR");
check("falls back to English when nothing matches", guessLanguage(["xx-YY"], codes) === "en-US");
check("handles missing input", guessLanguage(undefined, codes) === "en-US" && guessLanguage([], codes) === "en-US");
check("uses a custom fallback", guessLanguage([], codes, "fr-FR") === "fr-FR");

console.log("pickSuggestions");
const p = (id) => ({ _id: `p${id}`, userId: { _id: id, name: id } });
const list = [p("me"), p("a"), p("b"), p("a"), { _id: "x", userId: null }, p("c"), p("d")];
const picked = pickSuggestions(list, "me", 3);
check("excludes the current user", !picked.some((x) => x.userId._id === "me"));
check("removes duplicates and half-loaded profiles", picked.map((x) => x.userId._id).join() === "a,b,c");
check("respects the limit", picked.length === 3);
check("handles empty input", pickSuggestions(undefined, "me").length === 0);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
