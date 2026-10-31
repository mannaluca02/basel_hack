// Detects the conversation language from the person's first words. A word list covers
// the usual openings instantly; unclear text goes to the backend model.
const MARKERS = {
  de: ["ich", "bin", "und", "hallo", "grüezi", "hoi", "sali", "deutsch", "gerne", "gern", "bitte", "möchte", "mein", "heisse", "heiße", "nicht", "ja", "das", "ist", "sprechen", "auf", "guten", "tag", "danke"],
  fr: ["je", "suis", "bonjour", "salut", "français", "francais", "oui", "merci", "parler", "préfère", "prefere", "plaît", "plait", "c'est", "moi", "mon", "m'appelle", "est", "en", "voudrais", "allô"],
  it: ["ciao", "sono", "buongiorno", "buonasera", "italiano", "grazie", "parlare", "preferisco", "mi", "chiamo", "sì", "si", "vorrei", "per", "favore", "è", "io", "salve"],
  en: ["i", "i'm", "am", "hello", "hi", "hey", "english", "please", "speak", "my", "name", "is", "yes", "prefer", "the", "would", "like", "thanks"],
};

/** Returns "de" | "fr" | "it" | "en", or null when the words do not decide it. */
export function detectLanguageByWords(text) {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const scores = Object.fromEntries(
    Object.entries(MARKERS).map(([language, markers]) => [language, words.filter((word) => markers.includes(word)).length]),
  );
  const [[best, top], [, second]] = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return top > 0 && top > second ? best : null;
}

export async function detectLanguage(client, model, text) {
  const byWords = detectLanguageByWords(text);
  if (byWords) return byWords;
  const result = await client.responses.create({
    model,
    instructions: "Which language is this text in? Answer with the code only.",
    input: text,
    text: {
      format: {
        type: "json_schema",
        name: "language",
        strict: true,
        schema: {
          type: "object",
          properties: { language: { type: "string", enum: ["de", "fr", "it", "en", "unknown"] } },
          required: ["language"],
          additionalProperties: false,
        },
      },
    },
  });
  const { language } = JSON.parse(result.output_text);
  return language === "unknown" ? null : language;
}
