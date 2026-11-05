import { chrF, containsAll, mean, percentile } from "./metrics.js";

const groupMean = (results, keyOf) => {
    const groups = new Map();
    for (const result of results) {
        for (const key of keyOf(result)) {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(result.chrF);
        }
    }
    return Object.fromEntries(
        [...groups].map(([key, scores]) => [key, { n: scores.length, meanChrF: mean(scores) }])
    );
};

// Runs every item through `translate({ text, targetLang })` and scores it.
// `translate` is injected so the same code scores a real model, a stub, or the
// references themselves (a dry run that proves the harness and data are sound).
export const runEval = async ({ items, translate, concurrency = 4, now = () => Date.now() }) => {
    const results = new Array(items.length);
    let next = 0;

    const worker = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            const item = items[index];
            const startedAt = now();
            try {
                const output = await translate({ text: item.source, targetLang: item.targetLang, item });
                const latencyMs = now() - startedAt;
                const hypothesis = typeof output === "string" ? output : "";
                results[index] = {
                    id: item.id,
                    targetLang: item.targetLang,
                    tags: item.tags || [],
                    hypothesis,
                    reference: item.reference,
                    chrF: chrF(hypothesis, item.reference),
                    mustContainPassed: containsAll(hypothesis, item.mustContain),
                    hasMustContain: (item.mustContain || []).length > 0,
                    latencyMs,
                    error: null,
                };
            } catch (error) {
                // One failed request must not sink the whole run - it is counted
                // and scored as zero so it shows up in the averages.
                results[index] = {
                    id: item.id,
                    targetLang: item.targetLang,
                    tags: item.tags || [],
                    hypothesis: "",
                    reference: item.reference,
                    chrF: 0,
                    mustContainPassed: false,
                    hasMustContain: (item.mustContain || []).length > 0,
                    latencyMs: now() - startedAt,
                    error: error.message || String(error),
                };
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

    const completed = results.filter((result) => !result.error);
    const guarded = results.filter((result) => result.hasMustContain);
    const latencies = completed.map((result) => result.latencyMs);

    return {
        results,
        summary: {
            count: results.length,
            errors: results.length - completed.length,
            meanChrF: mean(results.map((result) => result.chrF)),
            mustContain: {
                passed: guarded.filter((result) => result.mustContainPassed).length,
                total: guarded.length,
            },
            latencyMs: {
                mean: mean(latencies),
                p50: percentile(latencies, 50),
                p95: percentile(latencies, 95),
            },
            byLanguage: groupMean(results, (result) => [result.targetLang]),
            byTag: groupMean(results, (result) => result.tags),
        },
    };
};

// How a new run differs from a saved one - the point of an eval is watching
// this number move when something changes.
export const compareRuns = (previous, current) => {
    const languages = new Set([
        ...Object.keys(previous.byLanguage || {}),
        ...Object.keys(current.byLanguage || {}),
    ]);
    const byLanguage = {};
    for (const language of languages) {
        const before = previous.byLanguage?.[language]?.meanChrF;
        const after = current.byLanguage?.[language]?.meanChrF;
        if (before !== undefined && after !== undefined) byLanguage[language] = after - before;
    }
    // Compared as a rate, not a count: a run filtered to one language has fewer
    // items, and raw counts would make it look like it lost thousands of points.
    const rate = (run) => (run.mustContain.total ? run.mustContain.passed / run.mustContain.total : 1);
    return {
        meanChrF: current.meanChrF - previous.meanChrF,
        mustContainRate: rate(current) - rate(previous),
        p50LatencyMs: current.latencyMs.p50 - previous.latencyMs.p50,
        byLanguage,
        // Runs over different items are not like-for-like - callers should say so.
        sameItemCount: current.count === previous.count,
    };
};

// Catches mistakes in the dataset itself before they skew a score.
export const validateDataset = (items, supportedLanguages) => {
    const problems = [];
    const seen = new Set();
    for (const item of items) {
        if (!item.id || seen.has(item.id)) problems.push(`duplicate or missing id: ${item.id}`);
        seen.add(item.id);
        if (!item.source?.trim()) problems.push(`${item.id}: empty source`);
        if (!item.reference?.trim()) problems.push(`${item.id}: empty reference`);
        if (!supportedLanguages.has(item.targetLang)) problems.push(`${item.id}: unsupported target ${item.targetLang}`);
        if (!supportedLanguages.has(item.sourceLang)) problems.push(`${item.id}: unsupported source ${item.sourceLang}`);
        if (item.sourceLang === item.targetLang) problems.push(`${item.id}: source and target are the same language`);
    }
    return problems;
};
