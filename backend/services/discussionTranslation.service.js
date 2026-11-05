// Translating discussion-room chat so people can follow a conversation in a
// language they don't speak. Each message is translated once per language that
// is actually present in the room (never once per person), capped, and cached.

const MAX_TARGET_LANGUAGES = 4;
const CACHE_LIMIT = 300;

const baseOf = (lang) => (lang || "en-US").split("-")[0];

// A message that is only emoji, numbers or punctuation has nothing to translate.
export const hasTranslatableText = (body) => /\p{L}/u.test(body || "");

// Languages worth translating into: those spoken by someone in the room other
// than in the sender's own language, most-common first, capped so one busy
// multilingual room can't turn every message into a dozen paid requests.
export const pickTargetLanguages = ({
    senderLang,
    participantLangs,
    max = MAX_TARGET_LANGUAGES,
}) => {
    const senderBase = baseOf(senderLang);
    const counts = new Map();
    for (const lang of participantLangs) {
        if (!lang || baseOf(lang) === senderBase) continue;
        counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([lang]) => lang);
};

// A small least-recently-used cache. "hi", "thanks" and "lol" repeat all day in
// a busy room, and translating them again each time is pure waste.
export const createTranslationCache = (limit = CACHE_LIMIT) => {
    const entries = new Map();
    return {
        get(key) {
            if (!entries.has(key)) return undefined;
            const value = entries.get(key);
            entries.delete(key);
            entries.set(key, value);
            return value;
        },
        set(key, value) {
            entries.delete(key);
            entries.set(key, value);
            if (entries.size > limit) entries.delete(entries.keys().next().value);
        },
        get size() {
            return entries.size;
        },
    };
};

const sharedCache = createTranslationCache();

// Returns [{ lang, text }] for every target language that translated. Requests
// run in parallel (a caption should not wait on each language in turn) and one
// failing language never loses the others.
export const translateRoomMessage = async ({
    body,
    senderLang,
    participantLangs,
    translate,
    cache = sharedCache,
    onError = () => {},
}) => {
    if (!hasTranslatableText(body)) return [];
    const targets = pickTargetLanguages({ senderLang, participantLangs });
    if (targets.length === 0) return [];

    const settled = await Promise.all(
        targets.map(async (lang) => {
            const key = JSON.stringify([lang, body]);
            const cached = cache.get(key);
            if (cached !== undefined) return { lang, text: cached };
            try {
                const text = await translate({ text: body, targetLang: lang });
                if (!text) return null;
                cache.set(key, text);
                return { lang, text };
            } catch (error) {
                onError(lang, error);
                return null;
            }
        })
    );
    return settled.filter(Boolean);
};
