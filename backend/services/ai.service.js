const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

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
