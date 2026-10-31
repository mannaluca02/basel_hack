# Pax Voice Agent (GPT-Live-1)

Voice side of Pax LifeMap (owner: Dario). The browser talks to OpenAI GPT-Live-1 over WebRTC.
Paxi has a relaxed chat in du-form, like a broker who gets to know you, and picks up the questionnaire details (`questionnaire.json`) along the way. It never pitches products. When the person confirms a detail, GPT-Live delegates to a Responses backend model. That model calls the `save_answer` function, and this server checks the value against the questionnaire before storing it.

Each conversation is written to `data/conversations/<conversationId>.json`. The file holds the transcript (both speakers, grouped into turns), the questionnaire answers, the session events and, after the call, the extracted life context. `data/` is gitignored because it contains personal data.

## Run the demo

```bash
npm install
npm start
```

Put `OPENAI_API_KEY` in the repo root `.env` (see `.env.example`) and open http://localhost:3000. Tap Paxi to start; microphone access needs `localhost` or HTTPS. The demo page only exists to test how Paxi behaves in a conversation. It shows Lukas's avatar (served from `../avatar-prototype`), the transcript, the questionnaire and a link to the JSON log.

`npm test` runs the log and validation tests.

## Use it in the app

`public/paxi-voice.js` is the reusable part: a plain ES module without UI. The Angular voice service can use it the same way the demo does:

```js
import { createPaxiVoice } from "./paxi-voice.js";

const paxi = createPaxiVoice({
  baseUrl: "",                                        // where the voice-agent server runs
  onAudioStream: (stream) => avatar.attachAudio(stream), // called again after a voice switch
  onAvatarEvent: (event) => avatar.handle(event),        // activity + playback, see AVATAR-INTERFACE.md
  onTranscript: ({ speaker, text, startMs, endMs }) => {},
  onAnswer: ({ fieldId, value }) => {},
  onStatus: ({ state, detail, conversationId }) => {},   // connecting | connected | switching | ended | error
});

paxiButton.onclick = () => paxi.start(); // must run from a click: browsers require it for microphone and audio
// After Paxi closed the call for inactivity (onStatus: { state: "ended", detail: "inactive", conversationId }):
paxiButton.onclick = () => paxi.start({ resume: conversationId });
paxi.stop();
```

The server part (`server.mjs`) keeps the API key, creates the GPT-Live sessions, runs the checks and writes the log. In the full solution these routes move into the NestJS backend as the VoiceAdapter.

## Persona and conversation style

`persona.md` is the opening prompt: who Paxi is, du-form, the broker approach and the topics to chat about (name, age, hobbies, work, living, plans). Edit it freely and restart the server. The server appends the questionnaire fields, the language rules and the delegation policies.

## Customer portfolio (`questionnaire.json`)

`questionnaire.json` lists everything Pax needs to know about a customer: 37 fields in seven sections (person, family, work and income, living, provision and assets, goals, suitability check). Each field has a casual du-form question, a type (`string`, `date`, `integer`, `money`, `enum`, `boolean`), a tier and, where available, the matching path in the shared contracts (`contractPath`) and its source.

| Tier | Fields | Who collects them |
|---|---|---|
| `core` | 14 | Paxi, in the first conversation. Paxi does not wrap up while one is open. |
| `extended` | 15 | Paxi, when they fit the conversation; a colleague completes the rest. |
| `suitability` | 8 | Only a Pax colleague (legally required suitability check before investment-linked insurance). Paxi never asks them. |

Sources: the shared contracts (`InsuranceIntakeSchema`, `PersonSchema`, `GoalSchema` on `feature/life-insurance-live-backend`), the Pax pension analysis, the public pension analysis test inputs and the Pax suitability check. The prompts, the tool enums, the validation and the log are all built from this file, so changing it is enough to change what Paxi asks.

## Log format

```json
{
  "schemaVersion": "1.1",
  "conversationId": "live_…",
  "status": "active | closed | disconnected",
  "startedAt": "2026-10-31T14:00:00.000Z",
  "endedAt": "2026-10-31T14:03:12.000Z",
  "model": "gpt-live-1",
  "language": "fr",
  "sessions": [
    { "sessionId": "live_…", "voice": "juni", "language": null, "offsetMs": 0, "usage": null },
    { "sessionId": "live_…", "voice": "brise", "language": "fr", "offsetMs": 15745, "usage": { "seconds": 40 } }
  ],
  "questionnaire": { "id": "pax-intake-demo", "version": "0.1.0", "locale": "de-CH" },
  "answers": {
    "full_name": { "label": "Vor- und Nachname", "value": "Claire Dubois", "status": "captured", "updatedAt": "…" },
    "birth_date": { "label": "Geburtsdatum", "value": null, "status": "declined", "note": "Möchte das Geburtsdatum nicht sagen.", "updatedAt": "…" }
  },
  "humanFollowUp": [
    { "fieldId": "birth_date", "label": "Geburtsdatum", "reason": "Möchte das Geburtsdatum nicht sagen.", "at": "…" }
  ],
  "transcript": [
    { "speaker": "agent", "text": "Grüezi und bienvenue, benvenuti, welcome! Ich bin Paxi. …", "start_ms": 600, "end_ms": 11000 },
    { "speaker": "agent", "text": "Avec plaisir, on continue en français. …", "start_ms": 16345, "end_ms": 24000 }
  ],
  "events": [
    { "type": "language_set", "at": "…", "language": "fr" },
    { "type": "answer_saved", "at": "…", "callId": "call_…", "fieldId": "full_name", "value": "Claire Dubois" }
  ]
}
```

Each answer also carries its `tier`. Log `status` is `active`, `closed`, `disconnected` or `inactive`. Answer `status` is `open`, `captured`, `declined_once` (asked again later) or `declined` (goes to a colleague, see `humanFollowUp`). `start_ms`/`end_ms` are milliseconds from the start of the conversation. GPT-Live reports them per session; the server adds the session's `offsetMs`. GPT-Live has no turn boundaries, so consecutive fragments from one speaker less than 1.2 s apart count as one turn.

## Life context

Paxi does not save small talk during the call, because every save makes the model pause. When the conversation ends, the server sends the transcript to the backend model once (`conversation-context.mjs`). It writes a `context` section into the log: a short summary, notes per topic (hobbies, work, family, housing, plans, finances, health, other) and `possible_needs` as starting points for a Pax specialist. These are internal only, never product recommendations, and always in German.

## Intro

Every call starts with the recorded intro `public/intro.mp3` (four short clips: "Hi, ich bin Paxi! In welcher Sprache kann ich dir helfen?", then the same question in French, Italian and English; the text is in `welcome.txt`). The browser plays it itself while the microphone already runs, so the person can interrupt it just by speaking: as soon as their own words show up in the transcript, the intro stops. Without headphones, the intro can echo back through the microphone; transcript text that mostly repeats the intro's words is ignored.

A GPT-Live audio fixture was tried first, but GPT-Live drops all input while a fixture plays, so it could not be interrupted. If `public/intro.mp3` is missing, Paxi says `welcome.txt` live instead.

To replace the intro, combine new clips into `public/intro.mp3` and update `welcome.txt`:

```bash
ffmpeg -i w1.mp3 -i w2.mp3 -i w3.mp3 -i w4.mp3 -filter_complex "[0:a]apad=pad_dur=0.35[a0];[1:a]apad=pad_dur=0.3[a1];[2:a]apad=pad_dur=0.3[a2];[a0][a1][a2][3:a]concat=n=4:v=0:a=1[c]" -map "[c]" -ac 1 -b:a 96k public/intro.mp3
```

## Conversation rules

- **Paxi takes the initiative.** After 8 seconds of silence, Paxi asks a light question, asks for an open core detail or picks up an earlier topic (at most twice in a row); before a language is chosen, it asks again in all four languages.
- **Today's date.** Every session gets today's date (Europe/Zurich) in the Live and backend prompts, so ages and durations are calculated correctly.
- **Declined details.** If the person does not want to give a questionnaire detail, Paxi accepts it, changes the topic and asks gently once more later. The server enforces this: the first `decline_answer` only marks the detail as `declined_once`; a second one sets it to `declined` and adds it to `humanFollowUp` in the log, so a Pax colleague clarifies it personally.
- **Never wraps up early.** After every saved or declined detail, Paxi gets a quiet note of the core details still open (`session.thinking.append`) and may not say goodbye before they are collected. If the person wants to leave, Paxi names what is missing and asks quickly; if they still want to go, a colleague completes the rest.
- **Fast mode.** If the person is in a hurry, Paxi drops the small talk and asks the open core details one short question at a time.
- **Inactivity.** If the person says nothing for 30 seconds, Paxi says it will close the call in about 30 seconds and that they can simply continue later. After another 30 seconds of silence it says goodbye and closes the call (log status `inactive`). `paxi.start({ resume: conversationId })` continues the same conversation and log: Paxi welcomes the person back and continues with what is still open. The demo does this on the next tap.
- **"A colleague of mine".** Paxi never says "Pax specialist" or "Fachperson"; it always says that a colleague of theirs will get in touch.

## Language and voice switch

Paxi greets in German, French, Italian and English, asks "In welcher Sprache kann ich Ihnen helfen?" and tells the person to simply start speaking in their language. GPT-Live fixes the voice for each session, so switching voices works like this:

1. The browser collects the person's first words (during or after the welcome). After a 0.7 s pause, the server detects their language (`language-detect.mjs`: a word list for the usual openings, the backend model for anything unclear). Later language changes in the call come from the backend's `set_language` tool.
2. If that language has a different native voice, the browser mutes the current session and starts a new one with that voice. The new session gets the conversation so far as text history plus the answers already saved, and continues without greeting again.
3. Once the new session runs, the old one is closed. Both sessions write to the same log.

The switch takes about two seconds. Native voices: German `juni` (or `LIVE_VOICE`), French `brise`, English `gleam`, Italian the custom `paxi-it` voice (GPT-Live has no built-in Italian voice). The welcome and the first session use the German voice. Switching to another language later in the call triggers the same switch again.

## Custom voices

`paxi-voice.mjs` describes two voices made from a text description. Paxi uses the Italian-only voice after switching to Italian. The multilingual Paxi voice is optional (`LIVE_VOICE=paxi` with `LIVE_VOICE_ID`). Built-in voices are recorded from real speakers and sound most natural. Generated voices can sound more synthetic.

```bash
node create-voice.mjs italian
```

```bash
node create-voice.mjs
```

They print `LIVE_VOICE_ID_IT=voice_…` and `LIVE_VOICE_ID=voice_…`; add those lines to the repo root `.env`. Each run saves a new voice (max 100 per organization). `LIVE_VOICE` sets the welcome and German voice (`juni`).

## Notes

- If Paxi sounds choppy, try headphones first. GPT-Live listens while it speaks, so without headphones it can hear itself through the speakers and stop or restart mid-sentence. The page turns on the browser's echo cancellation, but laptop speakers can still leak.

- Voice, model and delegation mode are fixed when the session starts. Set `LIVE_VOICE_ID` (or `LIVE_VOICE`), `LIVE_MODEL` and `LIVE_BACKEND_MODEL` in `.env`.
- `status: "captured"` means the person confirmed the value by voice and it passed validation. It is not yet the confirmed case state (I02) from the [interface contracts](../../documentation/baselhack/plans/interface-contracts.md).
- Only local origins can create sessions. Add authentication before deploying anywhere else.
