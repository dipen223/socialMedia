const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

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
