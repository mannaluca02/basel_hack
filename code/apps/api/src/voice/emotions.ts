/**
 * Paxi's reply emotions as GPT-Live Decisions triggers, the same nine choices and wording as the
 * standalone voice agent (code/voice-agent/server.mjs). GPT-Live classifies every transcript
 * fragment and reports the answer on the data channel as `decision.event`; the web app's live
 * voice turns it into the avatar's expression (avatar-prototype/AVATAR-INTERFACE.md).
 */
export const EMOTION_CHOICES = [
  { value: 'neutral', description: 'Sachlicher, ruhiger Grundzustand ohne besonderen Anlass. Im Zweifel neutral.' },
  { value: 'acknowledging', description: 'Kurze Bestätigung oder Zusammenfassung: Ich habe dich verstanden. Keine neue Erklärung oder Erfolgsmeldung.' },
  { value: 'curious', description: 'Offene Rückfrage zu Wünschen, Lebenssituation oder fehlenden Angaben der Person.' },
  { value: 'explaining', description: 'Paxi erklärt Zusammenhänge, Berechnungen, Vorsorgelücken oder nächste Optionen sachlich und engagiert.' },
  { value: 'shocked', description: 'Nur bei echtem Schock: etwas wirklich Unerwartetes oder Alarmierendes wurde gesagt. Nicht bei blosser Sorge, Überraschung oder Belastung.' },
  { value: 'empathetic', description: 'Persönlicher Verlust, Krankheit oder Belastung: stilles Mitgefühl zeigen.' },
  { value: 'pleased', description: 'Warme Begrüssung, Willkommen oder freundliche Freude über eine gute Nachricht.' },
  { value: 'recovering', description: 'Paxi hat etwas missverstanden, korrigiert sich oder muss einen Versuch beziehungsweise eine Erklärung wiederholen.' },
  { value: 'presenting_offer', description: 'Nur wenn gerade eine konkrete Offerte oder ein fertiges Ergebnis tatsächlich präsentiert wird. Nicht bei einer Ankündigung oder blossen Zustimmung.' },
] as const;

export const EMOTION_TRIGGERS = [
  { type: 'decisions', event_type: 'session.input_transcript.delta',
    decisions: { questions: [{ type: 'choice', name: 'reply_emotion', instructions: 'Welche Emotion soll Paxi in der Antwort auf die aktuellen Worte der Person zeigen?', choices: EMOTION_CHOICES }] } },
  { type: 'decisions', event_type: 'session.output_transcript.delta',
    decisions: { questions: [{ type: 'choice', name: 'emotion', instructions: 'Welche Emotion passt zu dem, was Paxi gerade sagt?', choices: EMOTION_CHOICES }] } },
] as const;
