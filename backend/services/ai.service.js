const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

const LANGUAGE_NAMES = {
    "en-US": "English",
    "es-MX": "Spanish (Latin American)",
    "es-ES": "Spanish (Spain)",
    "fr-FR": "French",
    "de-DE": "German",
    "it-IT": "Italian",
    "pt-BR": "Portuguese (Brazilian)",
    "ru-RU": "Russian",
    "hi-IN": "Hindi",
    "zh-CN": "Chinese (Simplified)",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "ne-NP": "Nepali",
    "bn-BD": "Bengali",
    "ur-PK": "Urdu",
    "ar-SA": "Arabic",
    "tr-TR": "Turkish",
    "vi-VN": "Vietnamese",
    "id-ID": "Indonesian",
    "nl-NL": "Dutch",
    "pl-PL": "Polish",
};

export const SUPPORTED_TRANSLATION_LANGUAGES = new Set(Object.keys(LANGUAGE_NAMES));

const requireApiKey = () => {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error("AI features are not configured yet.");
        error.status = 503;
        throw error;
    }
};

const readApiResponse = async (response, fallbackMessage) => {
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.error?.message || fallbackMessage);
        error.status = response.status;
        error.code = data.error?.code;
        throw error;
    }

    return data;
};

const readOutputText = (response) => {
    if (typeof response.output_text === "string") {
        return response.output_text.trim();
    }

    return response.output
        ?.flatMap((item) => item.content || [])
        .find((content) => content.type === "output_text")
        ?.text
        ?.trim();
};

export const correctGrammar = async (text) => {
    requireApiKey();

    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.OPENAI_GRAMMAR_MODEL || "gpt-5-nano",
            instructions: [
                "Correct only grammar, spelling, punctuation, and capitalization.",
                "Preserve the writer's meaning, voice, slang, emojis, line breaks, and language.",
                "Do not add facts, commentary, quotation marks, labels, or explanations.",
                "Return only the corrected post text."
            ].join(" "),
            input: text,
            reasoning: { effort: "minimal" },
            max_output_tokens: 1000
        }),
        signal: AbortSignal.timeout(15000)
    });

    const data = await readApiResponse(response, "The grammar service is unavailable.");

    const suggestion = readOutputText(data);
    if (!suggestion) {
        const reason = data.incomplete_details?.reason || data.status || "unknown";
        throw new Error(`The grammar service returned no text (${reason}).`);
    }

    return suggestion;
};

export const generateImage = async (prompt) => {
    requireApiKey();

    const response = await fetch(OPENAI_IMAGES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
            prompt,
            size: "1024x1024",
            quality: "low",
            n: 1
        }),
        signal: AbortSignal.timeout(120000)
    });

    const data = await readApiResponse(response, "The image service is unavailable.");
    const imageBase64 = data.data?.[0]?.b64_json;

    if (!imageBase64) {
        throw new Error("The image service returned no image.");
    }

    return imageBase64;
};

export const transcribeCallAudio = async ({
    buffer,
    mimeType = "audio/webm",
}) => {
    requireApiKey();
    const form = new FormData();
    form.append(
        "file",
        new Blob([buffer], { type: mimeType }),
        "ripple-call.webm"
    );
    form.append(
        "model",
        process.env.OPENAI_TRANSCRIPTION_MODEL ||
            "gpt-4o-transcribe-diarize"
    );
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
        signal: AbortSignal.timeout(180000),
    });
    const data = await readApiResponse(
        response,
        "The call transcription service is unavailable."
    );
    const transcript = (data.segments || [])
        .map((segment) => `${segment.speaker || "Speaker"}: ${segment.text}`)
        .join("\n")
        .trim();

    if (!transcript) {
        throw new Error("No speech was detected in this call.");
    }
    return transcript;
};

// No `language` param on purpose — omitting it lets Whisper auto-detect
// whatever language is actually being spoken, from its full ~99-language
// coverage, rather than trusting a locale the speaker picked ahead of time.
// verbose_json is what surfaces the detected language back to the caller;
// plain "json" only returns text.
export const transcribeAudio = async ({ buffer, mimeType = "audio/webm" }) => {
    requireApiKey();
    const extension = mimeType.includes("mp4")
        ? "clip.mp4"
        : mimeType.includes("ogg")
          ? "clip.ogg"
          : "clip.webm";
    const form = new FormData();
    form.append(
        "file",
        new Blob([buffer], { type: mimeType }),
        extension
    );
    form.append(
        "model",
        process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1"
    );
    form.append("response_format", "verbose_json");

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
        signal: AbortSignal.timeout(60000),
    });
    const data = await readApiResponse(
        response,
        "The speech transcription service is unavailable."
    );
    return {
        text: (data.text || "").trim(),
        // Whisper returns a bare ISO-639-1 code ("english", "nepali" as a
        // language NAME in some cases, but for verbose_json on the
        // transcriptions endpoint it's the short code, e.g. "en"/"ne").
        language: (data.language || "").toLowerCase() || null,
    };
};

// Shared by translateSpeechText and translateMessageText - both detect the
// source language themselves rather than trusting a locale the sender picked
// ahead of time, and differ only in how the text is framed for the model.
const translateText = async ({ text, targetLang, framing }) => {
    requireApiKey();

    const targetName = LANGUAGE_NAMES[targetLang] || targetLang;

    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model:
                process.env.OPENAI_TRANSLATION_MODEL ||
                process.env.OPENAI_GRAMMAR_MODEL ||
                "gpt-5-nano",
            instructions: [
                `Detect the language of the user's message and translate it to ${targetName}.`,
                framing,
                "Output ONLY the translated text — no quotes, labels, explanations, or the original text.",
                "If the input has no real translatable content, output nothing.",
            ].join(" "),
            input: text,
            reasoning: { effort: "minimal" },
            max_output_tokens: 400,
        }),
        signal: AbortSignal.timeout(10000),
    });

    const data = await readApiResponse(response, "The translation service is unavailable.");
    return readOutputText(data) || "";
};

export const translateSpeechText = ({ text, targetLang }) =>
    translateText({
        text,
        targetLang,
        framing:
            "This is a fragment of live spoken call audio, not formal writing — it may be informal, cut off mid-sentence, or contain filler words. Translate it naturally, as speech.",
    });

// For chat messages, not spoken audio - preserve tone, slang, and emojis
// rather than smoothing them into formal writing.
export const translateMessageText = ({ text, targetLang }) =>
    translateText({
        text,
        targetLang,
        framing:
            "This is a written chat message between two people, not formal writing — keep the tone, slang, and any emojis as they are. Do not make it more formal.",
    });

// gpt-4o-mini-tts isn't explicitly gendered by OpenAI, but these are the
// commonly-recognized male/female-leaning voices among its options - override
// either via env if a specific one sounds better for your use case.
const VOICE_BY_GENDER = {
    male: process.env.OPENAI_TTS_VOICE_MALE || "onyx",
    female: process.env.OPENAI_TTS_VOICE_FEMALE || "coral",
};

export const synthesizeSpeech = async ({ text, language, voiceGender }) => {
    requireApiKey();

    // The TTS endpoint has no `language` param — it infers pronunciation from
    // the input text. `language` is accepted here only so this stays the sole
    // seam to touch when swapping in a provider with real locale/voice selection.
    void language;

    const response = await fetch(OPENAI_SPEECH_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
            voice: process.env.OPENAI_TTS_VOICE || VOICE_BY_GENDER[voiceGender] || VOICE_BY_GENDER.female,
            input: text,
            instructions:
                "Speak naturally and warmly, like a real person casually talking " +
                "to a friend on a call — not a formal announcer or a narrator. " +
                "Use a relaxed, conversational pace and natural intonation for " +
                "the language being spoken.",
            response_format: "mp3",
        }),
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        // Unlike readApiResponse's callers, a successful response here is raw
        // audio bytes, not JSON, so only the error path can call response.json().
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(
            errorBody.error?.message || "The speech synthesis service is unavailable."
        );
        error.status = response.status;
        throw error;
    }

    return Buffer.from(await response.arrayBuffer());
};

export const summarizeCallTranscript = async (transcript) => {
    requireApiKey();
    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model:
                process.env.OPENAI_CALL_SUMMARY_MODEL ||
                process.env.OPENAI_GRAMMAR_MODEL ||
                "gpt-5-nano",
            instructions: [
                "Summarize only information explicitly present in the call transcript.",
                "Do not invent names, decisions, promises, dates, or action items.",
                "Return valid JSON only with this exact shape:",
                '{"overview":"one concise paragraph","keyPoints":["point"],"actionItems":["action"]}.',
                "Use empty arrays when there are no supported key points or action items.",
            ].join(" "),
            input: transcript.slice(0, 120000),
            reasoning: { effort: "minimal" },
            max_output_tokens: 1800,
        }),
        signal: AbortSignal.timeout(60000),
    });
    const data = await readApiResponse(
        response,
        "The call summary service is unavailable."
    );
    const output = readOutputText(data)
        ?.replace(/^```json\s*/i, "")
        .replace(/```$/i, "")
        .trim();
    const summary = JSON.parse(output);

    return {
        overview:
            typeof summary.overview === "string"
                ? summary.overview.slice(0, 4000)
                : "",
        keyPoints: Array.isArray(summary.keyPoints)
            ? summary.keyPoints
                .filter((item) => typeof item === "string")
                .slice(0, 12)
                .map((item) => item.slice(0, 1000))
            : [],
        actionItems: Array.isArray(summary.actionItems)
            ? summary.actionItems
                .filter((item) => typeof item === "string")
                .slice(0, 12)
                .map((item) => item.slice(0, 1000))
            : [],
    };
};
