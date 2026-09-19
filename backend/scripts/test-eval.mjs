// Tests for the translation eval harness itself. Run with:
//   node backend/scripts/test-eval.mjs
process.env.OPENAI_API_KEY ||= "test";

import fs from "node:fs";
import { chrF, containsAll, normalize, percentile, mean } from "../eval/metrics.js";
import { runEval, compareRuns, validateDataset } from "../eval/runEval.js";
const { SUPPORTED_TRANSLATION_LANGUAGES } = await import("../services/ai.service.js");

let failed = 0;
const check = (label, condition) => {
    if (condition) console.log(`  ok  - ${label}`);
    else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log("normalize");
check("Devanagari digits become ASCII", normalize("६ बजे") === "6 बजे");
check("Arabic-Indic digits become ASCII", normalize("٣٠") === "30");
check("fullwidth digits become ASCII", normalize("３：３０").includes("3") && normalize("３：３０").includes("30"));
check("case is ignored", normalize("ALEX") === "alex");

console.log("chrF");
check("identical text scores 1", near(chrF("Hola, ¿cómo estás?", "Hola, ¿cómo estás?"), 1));
check("case and spacing do not matter", near(chrF("hola  cómo estás", "Hola cómo estás"), 1));
check("completely different text scores near 0", chrF("qqqq zzzz", "hola amigo") < 0.05);
const full = "Mi amigo Alex viene de visita la próxima semana.";
const partial = "Mi amigo Alex viene de visita.";
const unrelated = "Nos vemos en la estación a las seis.";
check("a partial translation scores between", chrF(partial, full) > 0.4 && chrF(partial, full) < 1);
check("closer text scores higher than unrelated text", chrF(partial, full) > chrF(unrelated, full));
check("recall is weighted above precision (missing words hurt more than extra ones)", chrF(partial, full) < chrF(full + " Muchas gracias por todo.", full));
check(
    "works on text without spaces (Chinese): one changed character still scores high, unrelated text low",
    chrF("我的朋友下周要来看我们。", "我的朋友下周要来看我。") > 0.6 &&
        chrF("最近的药店在哪里？", "我的朋友下周要来看我。") < 0.1
);
check("missing a name in a short sentence costs a lot (as it should)", chrF("我的朋友下周要来看我。", "我的朋友Alex下周要来看我。") < 0.6);
check("works on Devanagari", near(chrF("नमस्ते, आज आप कैसे हैं?", "नमस्ते, आज आप कैसे हैं?"), 1));
check("both empty is a match", chrF("", "") === 1);
check("empty vs something is 0", chrF("", "hola") === 0);
check("stays within 0..1", [chrF("a", "b"), chrF("abc", "abc"), chrF("abcdef", "abc")].every((v) => v >= 0 && v <= 1));

console.log("containsAll");
check("finds required strings", containsAll("Nos vemos a las 3:30 p. m.", ["3:30"]));
check("matches digits across scripts", containsAll("म तपाईंलाई ६ बजे भेट्नेछु", ["6"]));
check("is case-insensitive for names", containsAll("mi amigo alex", ["Alex"]));
check("fails when something is missing", !containsAll("Nos vemos a las 4:00", ["3:30"]));
check("nothing required always passes", containsAll("anything", []) && containsAll("anything", undefined));

console.log("percentile / mean");
check("median of 1..5 is 3", percentile([1, 2, 3, 4, 5], 50) === 3);
check("p95 of 1..100 is 95", percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95) === 95);
check("empty input is 0", percentile([], 50) === 0 && mean([]) === 0);

console.log("runEval");
const items = [
    { id: "a", sourceLang: "en-US", targetLang: "es-MX", source: "Hi", reference: "Hola amigo mío", tags: ["greeting"], mustContain: ["Hola"] },
    { id: "b", sourceLang: "en-US", targetLang: "es-MX", source: "Thanks", reference: "Muchas gracias", tags: ["thanks"] },
    { id: "c", sourceLang: "en-US", targetLang: "fr-FR", source: "Bye", reference: "Au revoir", tags: ["greeting"] },
];
let run = await runEval({ items, translate: async ({ item }) => item.reference });
check("translating with the reference scores perfectly", near(run.summary.meanChrF, 1) && run.summary.errors === 0);
check("must-contain items are counted", run.summary.mustContain.total === 1 && run.summary.mustContain.passed === 1);
check("results keep the input order", run.results.map((r) => r.id).join() === "a,b,c");
check("scores are grouped by language and tag", run.summary.byLanguage["es-MX"].n === 2 && run.summary.byTag.greeting.n === 2);

run = await runEval({ items, translate: async () => "zzzzzz" });
check("garbage scores low and fails the must-contain check", run.summary.meanChrF < 0.1 && run.summary.mustContain.passed === 0);

run = await runEval({
    items,
    translate: async ({ item }) => {
        if (item.id === "b") throw new Error("api down");
        return item.reference;
    },
});
check("one failing request does not stop the run", run.summary.count === 3 && run.summary.errors === 1);
check("a failed item is recorded with its error and scored 0", run.results[1].error === "api down" && run.results[1].chrF === 0);
check("failures pull the average down", run.summary.meanChrF < 1 && run.summary.meanChrF > 0.5);

let active = 0;
let peak = 0;
const many = Array.from({ length: 12 }, (_, i) => ({ ...items[0], id: `m${i}` }));
await runEval({
    items: many,
    concurrency: 3,
    translate: async ({ item }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return item.reference;
    },
});
check("never runs more requests at once than asked", peak <= 3 && peak > 1);

let clock = 0;
run = await runEval({
    items,
    concurrency: 1,
    now: () => clock,
    translate: async ({ item }) => {
        clock += item.id === "a" ? 100 : item.id === "b" ? 200 : 300;
        return item.reference;
    },
});
check("latency is measured per item", run.results.map((r) => r.latencyMs).join() === "100,200,300" && run.summary.latencyMs.p50 === 200);

console.log("compareRuns");
const before = { meanChrF: 0.5, mustContain: { passed: 2, total: 4 }, latencyMs: { p50: 900 }, byLanguage: { "es-MX": { meanChrF: 0.5 }, "fr-FR": { meanChrF: 0.6 } } };
const after = { meanChrF: 0.62, mustContain: { passed: 3, total: 4 }, latencyMs: { p50: 700 }, byLanguage: { "es-MX": { meanChrF: 0.7 }, "fr-FR": { meanChrF: 0.6 }, "de-DE": { meanChrF: 0.4 } } };
const delta = compareRuns(before, after);
check("reports the overall change", near(delta.meanChrF, 0.12) && near(delta.mustContainRate, 0.25) && delta.p50LatencyMs === -200);
check("compares must-contain as a rate, so a filtered run is not misread", near(compareRuns({ ...before, count: 47, mustContain: { passed: 14, total: 14 } }, { ...after, count: 10, mustContain: { passed: 4, total: 4 } }).mustContainRate, 0));
check("flags runs over a different number of items", compareRuns({ ...before, count: 47 }, { ...after, count: 10 }).sameItemCount === false && compareRuns({ ...before, count: 10 }, { ...after, count: 10 }).sameItemCount === true);
check("reports per-language change, only where both runs have the language", near(delta.byLanguage["es-MX"], 0.2) && near(delta.byLanguage["fr-FR"], 0) && !("de-DE" in delta.byLanguage));

console.log("dataset");
const dataset = JSON.parse(fs.readFileSync(new URL("../eval/translation.dataset.json", import.meta.url), "utf8"));
check("the real dataset has no problems", validateDataset(dataset.items, SUPPORTED_TRANSLATION_LANGUAGES).length === 0);
check("it covers 9 target languages", new Set(dataset.items.map((item) => item.targetLang)).size === 9);
check("it has 40+ items", dataset.items.length >= 40);
check("scoring the references against themselves is perfect", dataset.items.every((item) => near(chrF(item.reference, item.reference), 1)));
check("every must-contain string appears in its own reference", dataset.items.every((item) => containsAll(item.reference, item.mustContain)));
const bad = validateDataset(
    [
        { id: "x", sourceLang: "en-US", targetLang: "xx-XX", source: "a", reference: "b" },
        { id: "x", sourceLang: "en-US", targetLang: "en-US", source: "", reference: "" },
    ],
    SUPPORTED_TRANSLATION_LANGUAGES
);
check("the validator catches bad data (duplicate id, unknown language, empty text, same language)", bad.length >= 5);

if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
