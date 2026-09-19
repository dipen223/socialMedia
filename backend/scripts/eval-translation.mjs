// Scores the live-call translation against a hand-written reference set.
//
//   node scripts/eval-translation.mjs --dry            no API calls - checks the dataset
//                                                      and harness (scores the references)
//   node scripts/eval-translation.mjs --dry-degrade    no API calls - simulates a worse model
//                                                      (drops the end of every translation) to
//                                                      show what a drop looks like in the report
//   node scripts/eval-translation.mjs --yes            real run; costs one API call per item
//
// Options:
//   --lang es-MX      only items translated into this language
//   --tag number      only items with this tag
//   --limit 10        only the first N items
//   --concurrency 4   requests in flight at once
//   --out run.json    save this run's summary
//   --compare old.json  show how this run differs from a saved one
//
// A real run needs OPENAI_API_KEY (from .env) and --yes, so it can never spend
// money by accident.
import fs from "node:fs";
import dotenv from "dotenv";
import { runEval, compareRuns, validateDataset } from "../eval/runEval.js";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
};

const { SUPPORTED_TRANSLATION_LANGUAGES, translateSpeechText } = await import("../services/ai.service.js");
const dataset = JSON.parse(
    fs.readFileSync(new URL("../eval/translation.dataset.json", import.meta.url), "utf8")
);

const problems = validateDataset(dataset.items, SUPPORTED_TRANSLATION_LANGUAGES);
if (problems.length) {
    console.error("Dataset problems:\n  " + problems.join("\n  "));
    process.exit(1);
}

let items = dataset.items;
if (option("lang")) items = items.filter((item) => item.targetLang === option("lang"));
if (option("tag")) items = items.filter((item) => item.tags?.includes(option("tag")));
if (option("limit")) items = items.slice(0, Number(option("limit")));
if (items.length === 0) {
    console.error("No items match those filters.");
    process.exit(1);
}

const degrade = flag("dry-degrade");
const dry = flag("dry") || degrade;
if (!dry) {
    if (!process.env.OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY is not set. Use --dry to check the harness without any API calls.");
        process.exit(1);
    }
    if (!flag("yes")) {
        console.error(
            `This will make ${items.length} paid API calls (one per item).\n` +
                "Run again with --yes to go ahead, or --dry to check the harness for free."
        );
        process.exit(1);
    }
}

// A dry run "translates" each item to its own reference: it should score
// perfectly, which proves the data and the scoring are wired up correctly.
const translate = dry
    ? async ({ item }) =>
          // Keep only the first ~60% of the reference so the run scores worse.
          degrade ? [...item.reference].slice(0, Math.ceil(item.reference.length * 0.6)).join("") : item.reference
    : ({ text, targetLang }) => translateSpeechText({ text, targetLang });

console.log(dry ? `Dry run on ${items.length} items (no API calls)...` : `Running ${items.length} items...`);
const { results, summary } = await runEval({
    items,
    translate,
    concurrency: Number(option("concurrency")) || 4,
});

const pct = (value) => (value * 100).toFixed(1).padStart(5);
console.log(`\nOverall chrF: ${pct(summary.meanChrF)}   (0 = nothing matches, 100 = identical to the reference)`);
console.log(
    `Must-contain (names, numbers, times): ${summary.mustContain.passed}/${summary.mustContain.total} kept`
);
console.log(`Errors: ${summary.errors}`);
console.log(
    `Latency: mean ${Math.round(summary.latencyMs.mean)} ms, p50 ${Math.round(summary.latencyMs.p50)} ms, p95 ${Math.round(summary.latencyMs.p95)} ms`
);

console.log("\nBy language:");
for (const [language, row] of Object.entries(summary.byLanguage).sort((a, b) => a[1].meanChrF - b[1].meanChrF)) {
    console.log(`  ${language.padEnd(6)} ${pct(row.meanChrF)}  (${row.n} items)`);
}
console.log("\nBy tag:");
for (const [tag, row] of Object.entries(summary.byTag).sort((a, b) => a[1].meanChrF - b[1].meanChrF)) {
    console.log(`  ${tag.padEnd(10)} ${pct(row.meanChrF)}  (${row.n} items)`);
}

const worst = results.filter((r) => r.chrF < 1).sort((a, b) => a.chrF - b.chrF).slice(0, 5);
if (worst.length) {
    console.log("\nLowest-scoring items:");
    for (const r of worst) {
        console.log(`  ${r.id}  chrF ${pct(r.chrF)}${r.error ? `  ERROR: ${r.error}` : ""}`);
        console.log(`    got:  ${r.hypothesis}`);
        console.log(`    want: ${r.reference}`);
    }
}

if (option("compare")) {
    const previous = JSON.parse(fs.readFileSync(option("compare"), "utf8"));
    const delta = compareRuns(previous, summary);
    const sign = (n) => (n >= 0 ? "+" : "") + (n * 100).toFixed(1);
    console.log(`\nVs ${option("compare")}: chrF ${sign(delta.meanChrF)}, must-contain kept ${sign(delta.mustContainRate)} points, p50 latency ${delta.p50LatencyMs >= 0 ? "+" : ""}${Math.round(delta.p50LatencyMs)} ms`);
    if (!delta.sameItemCount) {
        console.log("  Note: that run covered a different number of items - use the same filters for a fair comparison.");
    }
    for (const [language, change] of Object.entries(delta.byLanguage)) {
        if (Math.abs(change) >= 0.01) console.log(`  ${language.padEnd(6)} ${sign(change)}`);
    }
}

if (option("out")) {
    fs.writeFileSync(option("out"), JSON.stringify(summary, null, 2));
    console.log(`\nSaved summary to ${option("out")}`);
}
