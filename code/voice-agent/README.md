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
paxi.stop();
```

The server part (`server.mjs`) keeps the API key, creates the GPT-Live sessions, runs the checks and writes the log. In the full solution these routes move into the NestJS backend as the VoiceAdapter.

## Persona and conversation style

`persona.md` is the opening prompt: who Paxi is, du-form, the broker approach and the topics to chat about (name, age, hobbies, work, living, plans). Edit it freely and restart the server. The server appends the questionnaire fields, the language rules and the delegation policies.

## Swap in the real questionnaire

Replace `questionnaire.json`. Every field needs `id`, `label`, `type` (`string` or `date`) and `question` (a casual way to ask, in du-form). The prompts, the `save_answer` enum and the log are built from this file. Adding another field type means adding a rule to `validateAnswer` in `conversation-log.mjs`.

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
    "birth_date": { "label": "Geburtsdatum", "value": null, "status": "open", "updatedAt": null }
  },
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

`start_ms`/`end_ms` are milliseconds from the start of the conversation. GPT-Live reports them per session; the server adds the session's `offsetMs`. GPT-Live has no turn boundaries, so consecutive fragments from one speaker less than 1.2 s apart count as one turn.

## Life context

Paxi does not save small talk during the call, because every save makes the model pause. When the conversation ends, the server sends the transcript to the backend model once (`conversation-context.mjs`). It writes a `context` section into the log: a short summary, notes per topic (hobbies, work, family, housing, plans, finances, health, other) and `possible_needs` as starting points for a Pax specialist. These are internal only, never product recommendations, and always in German.

## Welcome recording

The welcome in four languages (`welcome.txt`) is played as a fixed recording, so it sounds the same every time and starts without generation delay. The server plays it through the session itself (`session.output_audio.fixture.play` over a sideband connection), so GPT-Live knows it was said and continues naturally.

```bash
node record-welcome.mjs juni 3
```

This records three takes with the voice `juni` into `welcome/take-1.wav` … Listen to them, then pick the best one:

```bash
node record-welcome.mjs --pick 2
```

Restart the server afterwards. Without `welcome/welcome.pcm`, Paxi says the welcome live. A human recording works too: save it as raw mono PCM16 at 24 kHz in `welcome/welcome.pcm` (max 30 s) and put its text in `welcome/welcome-spoken.txt`.

## Language and voice switch

Paxi greets in German, French, Italian and English, asks "In welcher Sprache kann ich Ihnen helfen?" and tells the person to simply start speaking in their language. GPT-Live fixes the voice for each session, so switching voices works like this:

1. After the welcome, the person's first words go to the backend, which calls `set_language` (`de`, `fr`, `it`, `en`).
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
