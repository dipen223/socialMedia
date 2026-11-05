// Tests for translated discussion-room chat: the language-picking service on
// its own, then the real socket handlers driven with fake participants, a
// stubbed database and a stubbed OpenAI. No network. Run with:
//   node backend/scripts/test-room-translation.mjs
process.env.OPENAI_API_KEY = "test-key";
process.env.CLOUDINARY_CLOUD_NAME ||= "test";
process.env.CLOUDINARY_API_KEY ||= "test";
process.env.CLOUDINARY_API_SECRET ||= "test";

const {
    hasTranslatableText,
    pickTargetLanguages,
    createTranslationCache,
    translateRoomMessage,
} = await import("../services/discussionTranslation.service.js");
const { default: DiscussionRoom } = await import("../models/discussionRoom.model.js");
const { default: DiscussionMessage } = await import("../models/discussionMessage.model.js");
const { default: User } = await import("../models/user.model.js");
const { default: registerDiscussionHandlers } = await import("../sockets/discussion.socket.js");

let failed = 0;
const check = (label, condition) => {
    if (condition) console.log(`  ok  - ${label}`);
    else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the service on its own -------------------------------------------------
console.log("hasTranslatableText");
check("text with letters is translatable", hasTranslatableText("Hello there") && hasTranslatableText("你好") && hasTranslatableText("नमस्ते"));
check("emoji, numbers and punctuation are not", !hasTranslatableText("👍👍") && !hasTranslatableText("12345") && !hasTranslatableText("?!...") && !hasTranslatableText(""));

console.log("pickTargetLanguages");
check(
    "skips the sender's own language",
    pickTargetLanguages({ senderLang: "en-US", participantLangs: ["en-US", "es-MX", "en-US"] }).join() === "es-MX"
);
check(
    "treats regional variants of the sender's language as the same",
    pickTargetLanguages({ senderLang: "es-MX", participantLangs: ["es-ES", "fr-FR"] }).join() === "fr-FR"
);
check(
    "translates once per language, not once per person",
    pickTargetLanguages({ senderLang: "en-US", participantLangs: ["fr-FR", "fr-FR", "fr-FR"] }).length === 1
);
check(
    "puts the most common language first",
    pickTargetLanguages({ senderLang: "en-US", participantLangs: ["de-DE", "fr-FR", "fr-FR", "fr-FR", "de-DE"] }).join() === "fr-FR,de-DE"
);
check(
    "caps the number of languages",
    pickTargetLanguages({ senderLang: "en-US", participantLangs: ["fr-FR", "de-DE", "ja-JP", "ko-KR", "hi-IN", "ne-NP"] }).length === 4
);
check("ignores participants with no language", pickTargetLanguages({ senderLang: "en-US", participantLangs: [undefined, null, ""] }).length === 0);
check("an unknown sender language falls back to English", pickTargetLanguages({ senderLang: undefined, participantLangs: ["en-US", "fr-FR"] }).join() === "fr-FR");

console.log("cache");
const cache = createTranslationCache(2);
cache.set("a", 1);
cache.set("b", 2);
cache.get("a");
cache.set("c", 3);
check("evicts the least recently used entry", cache.get("b") === undefined && cache.get("a") === 1 && cache.get("c") === 3 && cache.size === 2);

console.log("translateRoomMessage");
let calls = [];
const translate = async ({ text, targetLang }) => {
    calls.push(targetLang);
    if (targetLang === "de-DE") throw new Error("boom");
    return `[${targetLang}] ${text}`;
};
const errors = [];
let out = await translateRoomMessage({
    body: "hello all",
    senderLang: "en-US",
    participantLangs: ["fr-FR", "de-DE", "es-MX"],
    translate,
    cache: createTranslationCache(),
    onError: (lang) => errors.push(lang),
});
check("returns a translation for each language that worked", out.map((t) => t.lang).sort().join() === "es-MX,fr-FR");
check("one failing language does not lose the others, and is reported", errors.join() === "de-DE");
calls = [];
const sharedCache = createTranslationCache();
await translateRoomMessage({ body: "thanks", senderLang: "en-US", participantLangs: ["fr-FR"], translate, cache: sharedCache });
await translateRoomMessage({ body: "thanks", senderLang: "en-US", participantLangs: ["fr-FR"], translate, cache: sharedCache });
check("a repeated message is served from the cache", calls.length === 1);
calls = [];
await translateRoomMessage({ body: "thanks", senderLang: "en-US", participantLangs: ["de-DE"], translate, cache: createTranslationCache() });
await translateRoomMessage({ body: "thanks", senderLang: "en-US", participantLangs: ["de-DE"], translate, cache: createTranslationCache() });
check("failures are not cached (they get retried)", calls.length === 2);
calls = [];
out = await translateRoomMessage({ body: "👍", senderLang: "en-US", participantLangs: ["fr-FR"], translate });
check("emoji-only messages make no requests", out.length === 0 && calls.length === 0);
out = await translateRoomMessage({ body: "hello", senderLang: "en-US", participantLangs: ["en-US", "en-GB"], translate });
check("nothing to do when everyone shares the sender's language", out.length === 0 && calls.length === 0);
let running = 0;
let peak = 0;
await translateRoomMessage({
    body: "parallel check",
    senderLang: "en-US",
    participantLangs: ["fr-FR", "es-MX", "ja-JP"],
    cache: createTranslationCache(),
    translate: async ({ targetLang }) => {
        running += 1;
        peak = Math.max(peak, running);
        await wait(20);
        running -= 1;
        return targetLang;
    },
});
check("languages are translated in parallel, not one after another", peak === 3);

// ---- the real socket handlers ---------------------------------------------
console.log("room chat, end to end");
const ROOM = "aaaaaaaaaaaaaaaaaaaaaaaa";
const languageOf = { alice: "en-US", bob: "es-MX", carla: "es-ES", dan: "fr-FR", erin: "en-US" };
User.findById = (id) => {
    const q = { select: () => q, lean: async () => ({ _id: id, name: id, username: id, profilePicture: "default.jpg", preferredLanguage: languageOf[id] }) };
    return q;
};
DiscussionRoom.findOne = () => {
    const q = { lean: async () => ({ _id: ROOM, hostId: "alice", speakerIds: [] }) };
    return q;
};
DiscussionRoom.updateOne = async () => ({});
DiscussionRoom.exists = async () => ({ _id: ROOM });

let messageCounter = 0;
let deletedMeanwhile = false;
DiscussionMessage.create = async ({ roomId, senderId, body }) => {
    messageCounter += 1;
    const doc = { _id: `bbbbbbbbbbbbbbbbbbbbbb${String(messageCounter).padStart(2, "0")}`, roomId, senderId, body };
    doc.populate = async () => doc;
    doc.toObject = () => ({ _id: doc._id, roomId, senderId, body });
    return doc;
};
const saves = [];
DiscussionMessage.findOneAndUpdate = async (filter, update) => {
    if (deletedMeanwhile) return null;
    saves.push({ filter, update });
    return { _id: filter._id };
};

const openaiCalls = [];
let openaiDelayMs = 0;
const failLanguages = new Set();
globalThis.fetch = async (url, options) => {
    if (!String(url).includes("/responses")) throw new Error(`unexpected fetch ${url}`);
    const payload = JSON.parse(options.body);
    const language = /translate it to (.*?)\./.exec(payload.instructions)?.[1];
    openaiCalls.push(language);
    if (openaiDelayMs) await wait(openaiDelayMs);
    if (failLanguages.has(language)) return { ok: false, json: async () => ({ error: { message: "down" } }) };
    return { ok: true, json: async () => ({ output_text: `[${language}] ${payload.input}` }) };
};

const events = [];
const handlers = {};
const io = {
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload, at: Date.now() }) }),
};
const makeSocket = (userId) => {
    const socket = {
        id: `sock-${userId}`,
        user: { id: userId },
        rooms: new Set(),
        data: {},
        on: (event, fn) => {
            handlers[`${userId}:${event}`] = fn;
        },
        join: (name) => socket.rooms.add(name),
        leave: (name) => socket.rooms.delete(name),
        emit: () => {},
    };
    registerDiscussionHandlers({ io, socket });
    return socket;
};
const fire = (userId, event, payload) =>
    new Promise((resolve) => {
        const result = handlers[`${userId}:${event}`](payload, (ack) => resolve({ ack, at: Date.now() }));
        // Handlers that never acknowledge still need to settle.
        Promise.resolve(result).then(() => setTimeout(() => resolve({ ack: undefined, at: Date.now() }), 400));
    });

for (const id of ["alice", "bob", "carla", "dan"]) makeSocket(id);
for (const id of ["alice", "bob", "carla", "dan"]) {
    const { ack } = await fire(id, "discussion:join", { roomId: ROOM });
    if (!ack?.ok) throw new Error(`${id} could not join`);
}
const mark = () => events.length;
const since = (from, name) => events.slice(from).filter((e) => e.event === name);

let m = mark();
openaiDelayMs = 120;
const sentAt = Date.now();
const { ack, at: ackAt } = await fire("alice", "discussion:message", { roomId: ROOM, body: "Hello everyone, welcome!" });
check("the message is sent and acknowledged", ack?.ok === true);
check("the sender is acknowledged before translation finishes", ackAt - sentAt < 100);
check("the original message goes to the room straight away", since(m, "discussion:message:new").length === 1 && since(m, "discussion:message:translated").length === 0);
await wait(300);
let translated = since(m, "discussion:message:translated");
check("the translations follow as their own event", translated.length === 1 && translated[0].room === `discussion:${ROOM}`);
check(
    "one translation per language present (Spanish MX, Spanish ES, French), none for English",
    translated[0].payload.translations.map((t) => t.lang).sort().join() === "es-ES,es-MX,fr-FR"
);
check("each carries the translated text", translated[0].payload.translations.every((t) => t.text.includes("Hello everyone")));
check("the event names the message it belongs to", translated[0].payload.messageId === "bbbbbbbbbbbbbbbbbbbbbb01");
check("the translations are saved on the message", saves.length === 1 && saves[0].update.$set.translations.length === 3);
check("nothing extra was requested", openaiCalls.length === 3);

console.log("cost controls");
openaiDelayMs = 0;
m = mark();
const callsBefore = openaiCalls.length;
await fire("alice", "discussion:message", { roomId: ROOM, body: "Hello everyone, welcome!" });
await wait(80);
check("the same message again is served from the cache (no new API calls)", openaiCalls.length === callsBefore && since(m, "discussion:message:translated").length === 1);
await fire("alice", "discussion:message", { roomId: ROOM, body: "👍👍" });
await wait(60);
check("an emoji-only message is not translated", openaiCalls.length === callsBefore);
m = mark();
await fire("erin-not-joined", "discussion:message", { roomId: ROOM, body: "hi" }).catch(() => {});

console.log("partial failure and deletion");
m = mark();
failLanguages.add("French");
await fire("alice", "discussion:message", { roomId: ROOM, body: "A brand new sentence to translate." });
await wait(100);
translated = since(m, "discussion:message:translated");
check("if French fails, the Spanish translations still arrive", translated.length === 1 && translated[0].payload.translations.map((t) => t.lang).sort().join() === "es-ES,es-MX");
failLanguages.clear();
m = mark();
deletedMeanwhile = true;
await fire("alice", "discussion:message", { roomId: ROOM, body: "Please delete this one soon." });
await wait(100);
check("a message deleted while translating is not published", since(m, "discussion:message:translated").length === 0);
deletedMeanwhile = false;

console.log("everyone shares a language");
makeSocket("erin");
await fire("erin", "discussion:join", { roomId: ROOM });
// Bob, Carla and Dan leave, so only English speakers remain.
for (const id of ["bob", "carla", "dan"]) handlers[`${id}:discussion:leave`]({ roomId: ROOM });
await wait(50);
m = mark();
const before = openaiCalls.length;
await fire("erin", "discussion:message", { roomId: ROOM, body: "It is only us English speakers now." });
await wait(80);
check("no translation work at all when nobody needs it", openaiCalls.length === before && since(m, "discussion:message:translated").length === 0);

if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
process.exit(0);
