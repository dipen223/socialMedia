// Pure scoring helpers for translation evaluation.

// Digits written in other scripts are the same number - a Nepali "६" should
// match an English "6", or the check punishes a perfectly good translation.
const DIGIT_RANGES = [0x0660, 0x06f0, 0x0966, 0xff10]; // Arabic-Indic, Persian, Devanagari, fullwidth

export const normalize = (text) => {
    let out = String(text ?? "").normalize("NFKC").toLowerCase();
    out = out.replace(/[٠-٩۰-۹०-९０-９]/g, (ch) => {
        const code = ch.codePointAt(0);
        const base = DIGIT_RANGES.filter((start) => code >= start).pop();
        return String(code - base);
    });
    return out;
};

const charNgrams = (text, n) => {
    const chars = [...normalize(text).replace(/\s+/g, "")];
    const counts = new Map();
    for (let i = 0; i + n <= chars.length; i += 1) {
        const gram = chars.slice(i, i + n).join("");
        counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    return counts;
};

// chrF: an F-score over character n-grams (Popovic 2015). Working on
// characters rather than words means it behaves sensibly for languages
// written without spaces (Chinese, Japanese) and for rich word endings
// (Hindi, Nepali), where word-based metrics such as BLEU are unreliable.
// beta = 2 weights recall twice as much as precision, the standard choice.
// Returns 0..1.
export const chrF = (hypothesis, reference, maxN = 6, beta = 2) => {
    const precisions = [];
    const recalls = [];
    for (let n = 1; n <= maxN; n += 1) {
        const hyp = charNgrams(hypothesis, n);
        const ref = charNgrams(reference, n);
        const hypTotal = [...hyp.values()].reduce((a, b) => a + b, 0);
        const refTotal = [...ref.values()].reduce((a, b) => a + b, 0);
        if (hypTotal === 0 || refTotal === 0) continue;
        let matches = 0;
        for (const [gram, count] of hyp) matches += Math.min(count, ref.get(gram) || 0);
        precisions.push(matches / hypTotal);
        recalls.push(matches / refTotal);
    }
    if (precisions.length === 0) {
        // Nothing to compare: only "both empty" counts as a match.
        return normalize(hypothesis).trim() === normalize(reference).trim() ? 1 : 0;
    }
    const p = precisions.reduce((a, b) => a + b, 0) / precisions.length;
    const r = recalls.reduce((a, b) => a + b, 0) / recalls.length;
    if (p === 0 && r === 0) return 0;
    const b2 = beta * beta;
    return ((1 + b2) * p * r) / (b2 * p + r);
};

// Names, numbers and times are where a wrong translation does real damage
// (a reminder for the wrong hour), so items can list strings that must survive.
export const containsAll = (hypothesis, required = []) => {
    const haystack = normalize(hypothesis);
    return required.every((needle) => haystack.includes(normalize(needle)));
};

export const percentile = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
};

export const mean = (values) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
