// Descriptions of Paxi's custom GPT-Live voices (created with create-voice.mjs).
// The description also goes into the session instructions, as OpenAI recommends
// for prompt-generated voices.
export const customVoices = {
  // One voice for all four languages; generated, so less natural than built-in voices.
  multilingual: {
    name: "Paxi",
    env: "LIVE_VOICE_ID",
    prompt:
      "A warm, friendly and trustworthy adult voice for Paxi, the digital pension advisor of the Swiss insurer Pax. " +
      "A native-level multilingual speaker of Swiss Standard German, Swiss French, Swiss Italian and clear international English. " +
      "Pronounces every language with its own native pronunciation and melody and never carries an accent from one language into another: " +
      "crisp Standard German with a light, friendly Swiss colouring; natural French vowels and liaisons; Italian with open vowels and rolled r; neutral English. " +
      "Mid-range pitch, clear consonants, calm and approachable conversational pace, smiling but not exaggerated, not an announcer.",
    // Representative speech in all four languages (max 2,000 characters).
    scriptHint: [
      "Grüezi und herzlich willkommen! Ich bin Paxi, Ihr digitaler Vorsorgeberater von Pax. Wann sind Sie geboren? Danke, ich habe den 3. März 1990 notiert.",
      "Bonjour et bienvenue ! Je suis Paxi, votre conseiller en prévoyance numérique de Pax. Quelle est votre date de naissance ? Merci, j'ai noté le trois mars mille neuf cent quatre-vingt-dix.",
      "Buongiorno e benvenuti! Sono Paxi, il vostro consulente digitale per la previdenza di Pax. Qual è la sua data di nascita? Grazie, ho annotato il tre marzo millenovecentonovanta.",
      "Hello and welcome! I'm Paxi, your digital pension advisor from Pax. What is your date of birth? Thank you, I've noted the third of March, nineteen ninety.",
    ].join("\n"),
  },
  // GPT-Live has no built-in Italian voice; this one only has to sound native in Italian.
  italian: {
    name: "Paxi Italiano",
    env: "LIVE_VOICE_ID_IT",
    prompt:
      "A warm, natural adult voice of a native Italian speaker from Ticino, Switzerland, speaking standard Italian with a light, friendly Swiss-Italian colouring. " +
      "Natural Italian melody and rhythm, open clear vowels, properly doubled consonants and a lightly rolled r. " +
      "Mid-range pitch, relaxed conversational pace, approachable and attentive like a friendly advisor talking to one person across the table. " +
      "Human and spontaneous, with natural breaths and small pauses; not an announcer, not theatrical, no synthetic or robotic sound.",
    scriptHint: [
      "Buongiorno e benvenuta! Sono Paxi. Per il controllo della previdenza mi servono solo un paio di informazioni, ci vorrà un attimo.",
      "Come si chiama, nome e cognome? Perfetto, allora ho scritto Anna Muster, giusto? Bene, grazie mille.",
      "E quando è nata? Il tre marzo millenovecentonovanta, ho capito bene? Ottimo, l'ho annotato.",
      "Se qualcosa non è chiaro, me lo dica pure tranquillamente. Ci prendiamo il tempo che serve.",
      "Allora, abbiamo tutto. Grazie per la pazienza, i suoi dati personali sono completi.",
    ].join("\n"),
  },
};
