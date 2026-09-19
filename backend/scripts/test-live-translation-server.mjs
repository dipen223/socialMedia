// Drives the real call.socket.js handlers with fake sockets, a stubbed
// database and a stubbed OpenAI - no network, no DB. Run with:
//   node backend/scripts/test-live-translation-server.mjs
process.env.OPENAI_API_KEY = "test-key";
process.env.ENFORCE_TRANSLATION_BILLING = "true";

const { default: User } = await import("../models/user.model.js");
const { default: Conversation } = await import("../models/conversations.model.js");
const { default: registerCallHandlers } = await import("../sockets/call.socket.js");

let failed = 0;
const check = (label, condition) => {
    if (condition) console.log(`  ok  - ${label}`);
    else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- stubs -----------------------------------------------------------------
const plans = { alice: "plus", bob: "plus" };
const usage = [];
User.findById = (id) => ({
    select: () => ({ lean: async () => ({ plan: plans[id] || "free", translationSecondsUsed: 0 }) }),
});
User.updateOne = async (filter, update) => {
    usage.push({ filter, update });
    return {};
};

Conversation.findOne = () => ({
    populate: () => ({
        lean: async () => ({
            _id: "conv1",
            members: [
                { _id: "alice", voiceGender: "female" },
                { _id: "bob", voiceGender: "male" },
            ],
        }),
    }),
});

let translateCalls = 0;
let ttsCalls = 0;
let translateDelayMs = 0;
let failTts = false;
globalThis.fetch = async (url, options) => {
    if (String(url).includes("/responses")) {
        translateCalls += 1;
        if (translateDelayMs) await wait(translateDelayMs);
        const { input } = JSON.parse(options.body);
        return { ok: true, json: async () => ({ output_text: `[es] ${input}` }) };
    }
    if (String(url).includes("/audio/speech")) {
        ttsCalls += 1;
        if (failTts) return { ok: false, json: async () => ({ error: { message: "tts down" } }) };
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    }
    throw new Error(`unexpected fetch ${url}`);
};

// ---- fake io / sockets -----------------------------------------------------
const handlers = {};
const sent = [];
const makeSocket = (id, userId) => {
    const socket = {
        id,
        user: { id: userId },
        on: (event, fn) => {
            handlers[`${id}:${event}`] = fn;
        },
        to: () => ({ emit: () => {} }),
        emit: (event, payload) => sent.push({ to: id, event, payload }),
    };
    return socket;
};
const io = {
    sockets: { adapter: { rooms: new Map([["user:bob", new Set(["b"])]]) } },
    to: (target) => ({ emit: (event, payload) => sent.push({ to: target, event, payload }) }),
};
const alice = makeSocket("a", "alice");
const bob = makeSocket("b", "bob");
registerCallHandlers({ io, socket: alice });
registerCallHandlers({ io, socket: bob });
const fire = (socketId, event, payload, ack) => handlers[`${socketId}:${event}`](payload, ack);
const eventsTo = (to, event) => sent.filter((item) => item.to === to && item.event === event);

// ---- set up an active call: alice (English) -> bob (Spanish) --------------
let callId;
await new Promise((resolve) =>
    fire("a", "call:invite", { conversationId: "conv1", targetUserId: "bob", mode: "audio" }, (r) => {
        callId = r.callId;
        resolve();
    })
);
await new Promise((resolve) => fire("b", "call:accept", { callId }, resolve));
fire("b", "call:answer", { callId, description: {} });
fire("a", "call:set-language", { callId, language: "en-US" });
fire("b", "call:set-language", { callId, language: "es-MX" });

const say = (payload) => fire("a", "call:translate-text", { callId, targetLang: "es-MX", ...payload });

console.log("caption goes out before any voice");
say({ text: "hello how are you doing today", segmentId: 1000, final: true, durationMs: 2000 });
await wait(50);
let results = eventsTo("b", "call:translation-result");
check("bob receives a translated caption", results.length === 1 && results[0].payload.translatedText.startsWith("[es] hello"));
check("caption is marked final with its segmentId", results[0].payload.final === true && results[0].payload.segmentId === 1000);
check("caption carries the speaker's language", results[0].payload.sourceLang === "en");
check("no voice was generated in browser-voice mode", ttsCalls === 0 && eventsTo("b", "call:translation-audio").length === 0);
check("final usage was metered", usage.length === 1 && usage[0].update.$inc.translationSecondsUsed === 2);

console.log("partial captions");
say({ text: "this is a partial phrase", segmentId: 2000, final: false });
await wait(50);
results = eventsTo("b", "call:translation-result");
check("partial is delivered, marked not-final", results.length === 2 && results[1].payload.final === false);
check("partials are not metered", usage.length === 1);
say({ text: "another partial straight away", segmentId: 2000, final: false });
await wait(50);
check("a second partial inside the rate limit is dropped", eventsTo("b", "call:translation-result").length === 2);

console.log("natural voice");
fire("b", "call:set-voice-mode", { callId, mode: "natural" });
say({ text: "please send the report tonight", segmentId: 3000, final: true, durationMs: 1500 });
await wait(80);
const audio = eventsTo("b", "call:translation-audio");
check("caption still arrives first", eventsTo("b", "call:translation-result").at(-1).payload.segmentId === 3000);
check("natural voice follows as its own event with audio", audio.length === 1 && audio[0].payload.audio?.url?.startsWith("data:audio/mpeg;base64,"));
check("audio event refers to the same segment", audio[0].payload.segmentId === 3000);

console.log("voice failure falls back cleanly");
failTts = true;
say({ text: "one more sentence for you", segmentId: 4000, final: true, durationMs: 1000 });
await wait(80);
const audio2 = eventsTo("b", "call:translation-audio");
check("audio event still sent, without audio, so the client can use browser voice", audio2.length === 2 && audio2[1].payload.audio === undefined && audio2[1].payload.translatedText);
failTts = false;

console.log("partials never trigger a voice");
const ttsBefore = ttsCalls;
await wait(750);
say({ text: "a long partial sentence here", segmentId: 5000, final: false });
await wait(80);
check("no TTS for a partial", ttsCalls === ttsBefore);

console.log("validation and gating");
const before = eventsTo("b", "call:translation-result").length;
say({ text: "", segmentId: 6000, final: true });
say({ text: "you", segmentId: 6001, final: true });
say({ text: "valid text here please", segmentId: "nope", final: true });
fire("a", "call:translate-text", { callId, text: "valid text here please", segmentId: 6002, targetLang: "xx-XX", final: true });
fire("a", "call:translate-text", { callId: "missing", text: "valid text here please", segmentId: 6003, targetLang: "es-MX", final: true });
say({ text: "hello in spanish already", segmentId: 6004, final: true, targetLang: "en-US" });
await wait(50);
check("empty, silence-artifact, bad id, bad language, unknown call and same-language are all dropped", eventsTo("b", "call:translation-result").length === before);
fire("b", "call:set-voice-mode", { callId, mode: "loud" });
const audioBefore = eventsTo("b", "call:translation-audio").length;
await wait(750);
say({ text: "checking the voice mode again", segmentId: 6100, final: true, durationMs: 1000 });
await wait(80);
check("an invalid voice mode is ignored (natural voice still on)", eventsTo("b", "call:translation-audio").length === audioBefore + 1);

console.log("plan gating");
plans.alice = "free";
// billing is cached per call, so use a fresh call for the free user
let callId2;
await new Promise((resolve) =>
    fire("a", "call:invite", { conversationId: "conv1", targetUserId: "bob", mode: "audio" }, (r) => {
        callId2 = r.callId;
        resolve();
    })
);
await new Promise((resolve) => fire("b", "call:accept", { callId: callId2 }, resolve));
fire("b", "call:answer", { callId: callId2, description: {} });
const callsBefore = translateCalls;
fire("a", "call:translate-text", { callId: callId2, text: "hello free user how are you", segmentId: 7000, targetLang: "es-MX", final: true });
await wait(50);
check("a free plan is blocked with an upgrade notice", eventsTo("a", "call:translation-blocked").length === 1);
check("and no translation call was made", translateCalls === callsBefore);

console.log("concurrency limit");
plans.alice = "plus";
let callId3;
await new Promise((resolve) =>
    fire("a", "call:invite", { conversationId: "conv1", targetUserId: "bob", mode: "audio" }, (r) => {
        callId3 = r.callId;
        resolve();
    })
);
await new Promise((resolve) => fire("b", "call:accept", { callId: callId3 }, resolve));
fire("b", "call:answer", { callId: callId3, description: {} });
fire("a", "call:set-language", { callId: callId3, language: "en-US" });
translateDelayMs = 150;
const c0 = translateCalls;
for (let i = 0; i < 4; i += 1) {
    fire("a", "call:translate-text", { callId: callId3, text: `sentence number ${i} here`, segmentId: 8000 + i, targetLang: "es-MX", final: true, durationMs: 500 });
}
await wait(300);
check("at most 2 finals are in flight per speaker", translateCalls - c0 === 2);

if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
process.exit(0);
