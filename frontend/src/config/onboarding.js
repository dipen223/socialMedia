// Pure helpers for the new-user welcome flow.

// Best supported language for the browser's language list: an exact match
// ("es-MX"), else the same base language ("es" -> first Spanish option), else
// English. Runs on whatever navigator.languages holds, most preferred first.
export const guessLanguage = (browserLanguages, supportedCodes, fallback = "en-US") => {
  const wanted = (browserLanguages || []).filter(Boolean);
  for (const language of wanted) {
    const exact = supportedCodes.find(
      (code) => code.toLowerCase() === language.toLowerCase()
    );
    if (exact) return exact;
    const base = language.split("-")[0].toLowerCase();
    const sameBase = supportedCodes.find((code) => code.split("-")[0].toLowerCase() === base);
    if (sameBase) return sameBase;
  }
  return fallback;
};

// People worth showing a brand-new user: everyone but themselves, no
// duplicates, no half-loaded profiles, capped so the step stays short.
export const pickSuggestions = (profiles, currentUserId, limit = 6) => {
  const seen = new Set();
  const picked = [];
  for (const profile of profiles || []) {
    const id = profile?.userId?._id;
    if (!id || id === currentUserId || seen.has(id)) continue;
    seen.add(id);
    picked.push(profile);
    if (picked.length >= limit) break;
  }
  return picked;
};
