// The set of languages a user can choose to receive translations in. This is
// a "target" list — speakers are never asked to pick a language, their speech
// is auto-detected on the backend regardless of what's in this list.
export const LANGUAGES = {
  "en-US": { name: "English (US)", flag: "🇺🇸" },
  "es-MX": { name: "Spanish (Mexico)", flag: "🇲🇽" },
  "es-ES": { name: "Spanish (Spain)", flag: "🇪🇸" },
  "fr-FR": { name: "French", flag: "🇫🇷" },
  "de-DE": { name: "German", flag: "🇩🇪" },
  "it-IT": { name: "Italian", flag: "🇮🇹" },
  "pt-BR": { name: "Portuguese (Brazil)", flag: "🇧🇷" },
  "ru-RU": { name: "Russian", flag: "🇷🇺" },
  "zh-CN": { name: "Chinese (Simplified)", flag: "🇨🇳" },
  "ja-JP": { name: "Japanese", flag: "🇯🇵" },
  "ko-KR": { name: "Korean", flag: "🇰🇷" },
  "hi-IN": { name: "Hindi", flag: "🇮🇳" },
  "ne-NP": { name: "Nepali", flag: "🇳🇵" },
  "bn-BD": { name: "Bengali", flag: "🇧🇩" },
  "ur-PK": { name: "Urdu", flag: "🇵🇰" },
  "ar-SA": { name: "Arabic", flag: "🇸🇦" },
  "tr-TR": { name: "Turkish", flag: "🇹🇷" },
  "vi-VN": { name: "Vietnamese", flag: "🇻🇳" },
  "id-ID": { name: "Indonesian", flag: "🇮🇩" },
  "nl-NL": { name: "Dutch", flag: "🇳🇱" },
  "pl-PL": { name: "Polish", flag: "🇵🇱" },
};

// Broader display table for whatever Whisper actually detects on the speaking
// side, keyed by bare ISO-639-1 code (no region) — auto-detection can surface
// far more languages than the curated LANGUAGES list above covers.
const DETECTED_LANGUAGE_DISPLAY = {
  en: { name: "English", flag: "🇺🇸" },
  es: { name: "Spanish", flag: "🇪🇸" },
  fr: { name: "French", flag: "🇫🇷" },
  de: { name: "German", flag: "🇩🇪" },
  it: { name: "Italian", flag: "🇮🇹" },
  pt: { name: "Portuguese", flag: "🇧🇷" },
  ru: { name: "Russian", flag: "🇷🇺" },
  zh: { name: "Chinese", flag: "🇨🇳" },
  ja: { name: "Japanese", flag: "🇯🇵" },
  ko: { name: "Korean", flag: "🇰🇷" },
  hi: { name: "Hindi", flag: "🇮🇳" },
  ne: { name: "Nepali", flag: "🇳🇵" },
  bn: { name: "Bengali", flag: "🇧🇩" },
  ur: { name: "Urdu", flag: "🇵🇰" },
  ar: { name: "Arabic", flag: "🇸🇦" },
  tr: { name: "Turkish", flag: "🇹🇷" },
  vi: { name: "Vietnamese", flag: "🇻🇳" },
  id: { name: "Indonesian", flag: "🇮🇩" },
  nl: { name: "Dutch", flag: "🇳🇱" },
  pl: { name: "Polish", flag: "🇵🇱" },
  th: { name: "Thai", flag: "🇹🇭" },
  sv: { name: "Swedish", flag: "🇸🇪" },
  no: { name: "Norwegian", flag: "🇳🇴" },
  da: { name: "Danish", flag: "🇩🇰" },
  fi: { name: "Finnish", flag: "🇫🇮" },
  el: { name: "Greek", flag: "🇬🇷" },
  he: { name: "Hebrew", flag: "🇮🇱" },
  uk: { name: "Ukrainian", flag: "🇺🇦" },
  cs: { name: "Czech", flag: "🇨🇿" },
  ro: { name: "Romanian", flag: "🇷🇴" },
  hu: { name: "Hungarian", flag: "🇭🇺" },
  fil: { name: "Filipino", flag: "🇵🇭" },
  sw: { name: "Swahili", flag: "🇰🇪" },
  ta: { name: "Tamil", flag: "🇮🇳" },
  ml: { name: "Malayalam", flag: "🇮🇳" },
  fa: { name: "Persian", flag: "🇮🇷" },
  ms: { name: "Malay", flag: "🇲🇾" },
};

export const displayForDetectedLanguage = (code) =>
  DETECTED_LANGUAGE_DISPLAY[(code || "").toLowerCase()] || {
    name: code || "Unknown",
    flag: "🌐",
  };
