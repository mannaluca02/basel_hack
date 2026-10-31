# Pax Voice Agent (GPT-Live-1)

Voice side of Pax LifeMap (owner: Dario). The browser talks to OpenAI GPT-Live-1 over WebRTC.
Paxi has a relaxed chat in du-form, like a broker who gets to know you, and picks up the questionnaire details (`questionnaire.json`) along the way. It never pitches products. Paxi only talks: after each turn of the person, the server reads the transcript and fills in every detail that was said (see [How details are saved](#how-details-are-saved)).

Each conversation is written to `data/conversations/<conversationId>.json`. The file holds the transcript (both speakers, grouped into turns), the questionnaire answers, the session events and, after the call, the extracted life context. `data/` is gitignored because it contains personal data.

## Run the demo

Requires Node.js 22 or newer, npm, a browser with microphone/WebRTC support and an OpenAI project key with access to the configured models.

Paxi runs inside the case backend's process: `npm run dev:paxi` in `code/` starts the backend with `PAX_VOICE_AGENT=1`, which also serves Paxi on port 3100, and the app in its `paxi` configuration, where the customer talks to Paxi in its own window. The other app configurations use the live voice built into the app instead. Install Paxi's dependencies once:

```bash
cd code/voice-agent
npm install
```

To run Paxi on its own (without the case backend), `npm start` in this folder still works. Do not run both at once: the backend then skips Paxi because port 3100 is taken.

Put `OPENAI_API_KEY` in the repo root `.env` (see `.env.example`) and open http://localhost:3100. Tap Paxi to start; microphone access needs `localhost` or HTTPS. The demo page only exists to test how Paxi behaves in a conversation. It shows Lukas's avatar (served from `../avatar-prototype`), the transcript, the questionnaire and a link to the JSON log.

`npm test` runs the log and validation tests.

## Configuration

The server reads the repository-root `.env`, not a file inside `code/voice-agent`. Create it from [`.env.example`](../../.env.example) if it does not already exist, then set `OPENAI_API_KEY`. Restart the server after configuration or prompt changes.

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Required to start a call | Server-side credentials; never put this key in browser code. |
| `PAX_VOICE_AGENT_PORT` | `3100` | HTTP port inside the case backend's process; the server binds to `127.0.0.1`. |
| `PORT` | `3100` | HTTP port when run on its own (`npm start` here). |
| `PAX_VOICE_AGENT` | off | `1` makes the case backend start Paxi (`dev:paxi` sets it). |
| `PAX_API_URL` | `http://127.0.0.1:3000` | Valentin's case backend that receives Paxi's proposals once a case is linked. |
| `PAX_APP_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` | Customer app origins allowed to hand a case to Paxi via `/api/case-link`. |
| `LIVE_MODEL` | `gpt-live-1` | Live speech model. |
| `LIVE_BACKEND_MODEL` | `gpt-6-luna` | Language delegation/detection, answer extraction and final context extraction. |
| `LIVE_VOICE` | `juni` | Initial/German voice key: `juni`, `nuri`, `flitz`, `brise`, `gleam`, or a configured custom key. |
| `LIVE_VOICE_ID` | Unset | Registers the optional custom voice key `paxi`. Set `LIVE_VOICE=paxi` to use it initially. |
| `LIVE_VOICE_ID_IT` | Unset | Registers `paxi-it` for Italian. Without it, Italian falls back to `paxi` if configured, otherwise `juni`. |

Use `http://localhost:<PORT>` exactly. Mutating API requests must carry that exact `Origin`; `127.0.0.1`, another port or another app origin is rejected. `baseUrl` in the client does not enable cross-origin access. Integration behind another origin requires corresponding server origin/CORS changes.

## Connected to the shared case

In the customer app (`npm run start:api` in `code/apps/web`), "Mit Paxi sprechen" shows the backend's voice notice, then creates a 15-minute case-scoped agent grant and posts it to `POST /api/case-link` here. The grant stays in this process (`case-bridge.mjs`), never in the log or the browser page. The app opens `http://localhost:3100/?link=<linkId>`; the first session of that conversation is linked to the case.

After every answer extraction, the bridge sends the captured details the backend maps directly (income, birth date, Pensum, pension fund, 3a, housing cost, civil status, retirement age, risk appetite) to `POST /api/cases/:id/voice/agent-observations`. Each one quotes the customer turn it comes from; a value not said in these digits goes as `approximate`, and the backend asks it back. The result is one **unconfirmed** package on the app's review stand: the person accepts it and confirms the profile there. A newer answer replaces a still open package; accepted answers are not proposed again. The bridge also sends every turn (both speakers, once it pauses) to `POST /api/cases/:id/voice/agent-turns`, so the app's Chat tab shows the call history. Both backend routes only work with `PAX_SYNTHETIC_VOICE_ENABLED=1`.

The app's call controls steer this window with `postMessage` (`{ type: "pax.call", action }`, actions `end`, `mute`, `unmute`, `stop_speaking`). Only the window that opened Paxi is listened to. `stop_speaking` mutes Paxi until the person speaks again; it does not cancel the model response on the server.

Without a link, Paxi runs as before and keeps everything in its own log.

## Architecture and data flow

1. The browser obtains the microphone and posts a WebRTC SDP offer to the local server. The server creates the Live session and returns its SDP answer; audio then travels between the browser and the Live service.
2. `public/paxi-voice.js` manages playback, the recorded intro, session switching, silence timers and avatar events. It posts transcript fragments to the server approximately every second.
3. The server waits 1.5 seconds after transcript updates before scheduling answer extraction. Extracted values pass questionnaire validation before being saved. This runs asynchronously, so transcript display and saved answers can arrive at different times.
4. The browser polls progress, emits answer callbacks and sends Paxi a quiet note of known and missing details. Language changes can create another Live session within the same conversation.
5. Closing the conversation saves its status and starts final context extraction. The `context` section can appear after the close response; it is absent when there were no user turns and contains an error marker if extraction fails.

Relevant implementation files: [server](server.mjs), [browser client](public/paxi-voice.js), [shared browser helpers](public/paxi-common.js), [answer extractor](answer-extractor.mjs), [log and validation](conversation-log.mjs), and [context extractor](conversation-context.mjs).

## Use it in the app

`public/paxi-voice.js` is the reusable part: a plain ES module without UI. The Angular voice service can use it the same way the demo does:

```js
import { createPaxiVoice } from "./paxi-voice.js";

import { createPaxAvatar } from "../avatar-prototype/pax-avatar.js";

const avatar = createPaxAvatar(hostElement);
const paxi = createPaxiVoice({
  baseUrl: "",                                        // where the voice-agent server runs
  onAudioStream: (stream) => avatar.attachAudio(stream), // called again after a voice switch
  onAvatarEvent: (event) => avatar.handle(event),        // activity, playback and emotion, see AVATAR-INTERFACE.md
  onTranscript: ({ speaker, text, startMs, endMs }) => {},
  onAnswer: ({ fieldId, value }) => {},
  onStatus: ({ state, detail, conversationId }) => {},   // connecting | connected | switching | ended | error
});

paxiButton.onclick = () => paxi.start(); // must run from a click: browsers require it for microphone and audio
// After Paxi closed the call for inactivity (onStatus: { state: "ended", detail: "inactive", conversationId }):
paxiButton.onclick = () => paxi.start({ resume: conversationId });
paxi.stop();

// Another part of the app (e.g. Earnie's advisor backend) can steer which questions come first:
paxi.start({ priorities: ["annual_gross_income_chf", "has_pension_fund"] });
paxi.prioritize(["housing"]); // during the call; [] clears the priorities
```

The server part (`server.mjs`) keeps the API key, creates the GPT-Live sessions, fills in the answers and writes the log. In the full solution these routes move into the NestJS backend as the VoiceAdapter.

### Client lifecycle and callbacks

`start({ resume?, priorities? })` is asynchronous and must be called from a user gesture. Catch its rejection to show microphone or connection errors. Calling it while already running has no effect. `stop()` requests a graceful close; use the `ended` status to update the UI. `running` reports the current client flag and `logUrl` is `null` until a conversation has been created.

`onTranscript` receives fragments, not complete turns; append them in the UI. Its `startMs`/`endMs` use the conversation timeline. `onAnswer` receives `{ fieldId, value, status }` for `captured` and final `declined` updates; `declined_once` is available through the progress API but does not trigger this callback. `onStatus` includes `conversationId` once available; retain it to resume later. Reattach the stream on every `onAudioStream` call, including voice switches. Avatar activity/playback/emotion event shapes are documented in [AVATAR-INTERFACE.md](../avatar-prototype/AVATAR-INTERFACE.md). Call `avatar.reset()` before starting a new conversation.

### Avatar emotions from the transcript

Paxi's face follows the conversation, as described in Lukas's [AVATAR-INTERFACE.md](../avatar-prototype/AVATAR-INTERFACE.md) (option A). Every session is created with two Decisions triggers: the person's transcript fragments predict the tone of Paxi's reply (`reply_emotion`), and Paxi's own words refine it (`emotion`). The nine emotions and their descriptions (`EMOTION_CHOICES` in `server.mjs`) match `ReplyEmotion` in `pax-avatar.d.ts`. The browser ties each `decision.event` to the transcript fragment it came from and to the matching playback segment, drops older results per direction, and sends `{ type: "emotion", emotion, playbackId }` to the avatar, which queues and stabilises them. The recorded intro shows `pleased`.

If the OpenAI project may not use Decisions (`api.decisions.write`), session creation is retried once without the triggers; voice keeps working and the response says `emotions: false`.

### HTTP API reference

All request bodies below are JSON. The browser module already handles these calls for normal app integration.

| Method and path | Request / result |
|---|---|
| `GET /api/questionnaire` | Returns the questionnaire, including suitability fields. |
| `POST /api/session` | `{ sdp, priorities?, continueFrom?, resume? }`; returns HTTP 201 with the Live result plus `conversationId`, `language`, `voice`, `offsetMs`, `greeting`, `intro`, and `fallbackGreeting`. `continueFrom` is an active session ID for a voice handoff; `resume` is a non-active conversation ID. Use one continuation mode at a time. |
| `POST /api/conversations/:sessionId/transcript` | `{ fragments: [{ speaker, text, start_ms, end_ms }] }`; speaker is `user` or `agent`, times are session-relative milliseconds. Accepted fragments are offset and merged in the log. Returns 204. |
| `GET /api/conversations/:sessionId/progress?since=0` | Returns answer `version`, `changes`, `known`, `open_priority`, `open_core`, `open_extended`, `core_complete`, and `complete`. Use the returned version as the next `since`. Open-field lists contain labels. |
| `POST /api/conversations/:sessionId/language` | `{ language: "de" }` (`de`, `fr`, `it`, `en`) or `{ text: "Bonjour…" }`; returns `{ ok, language, voice, switch_voice }`, or `{ ok: false, reason }`. |
| `POST /api/conversations/:sessionId/priorities` | `{ fields: ["annual_gross_income_chf"], source?: "advisor" }`; returns accepted `priorities`, `labels` and progress. Unknown/suitability IDs are filtered out; `[]` clears priorities. |
| `POST /api/conversations/:sessionId/close` | `{ status?: "closed", usage? }`; returns 204. `inactive` and `disconnected` set those conversation statuses; `handoff` closes only the current session. Other status values close the conversation as `closed`. |
| `GET /api/conversations/:sessionId` | Returns the complete conversation log shared by that session. |

The first session ID is also the conversation ID. After a voice switch, use the current session ID for API operations and keep the original conversation ID for resume. Session lookup is in memory: after a server restart, old session URLs return 404, but `POST /api/session` can load a non-active conversation from disk using `resume` and create a new session.

Typical errors are 400 for missing SDP or a non-array priority list, 403 for an unexpected/missing Origin, 404 for unknown sessions or invalid continuation/resume requests, and 503 when the API key is missing. Upstream session-creation failures return an error status with `Live session creation failed`.

## Persona and conversation style

For research and proposed scripts, see [Friendly sales conversations for Paxi](../../documentation/baselhack/research/friendly-sales-conversation.md). This guide includes psychological mechanisms, a conversational opening, sample dialogue and evaluation criteria; it does not change the live prompt.

`persona.md` is the opening prompt: who Paxi is, du-form, the broker approach and the topics to chat about (name, age, hobbies, work, living, plans). Edit it freely and restart the server. The server appends the questionnaire fields, the language rules and the delegation policies.

## Skills

Skills are Markdown files in `skills/` that extend Paxi's opening prompt. Each starts with a small front matter block (`name`, `description`, `source`, `assigned`); every skill with `assigned: true` is added right after `persona.md`, in file name order (`skills.mjs`). The server logs the loaded skills at startup (`Paxi skills: …`).

| Skill | What it adds |
|---|---|
| [`friendly-conversation.md`](skills/friendly-conversation.md) | Consultative conversation technique from the [research on friendly sales conversations](../../documentation/baselhack/research/friendly-sales-conversation.md): clear purpose, responsive follow-ups, tentative reflection, a reason before sensitive data, real choices, a summary with corrections before the goodbye, answers to hesitation ("Willst du mir etwas verkaufen?", "Ich habe schon eine Versicherung"), stopping on request, and a list of pressure tactics Paxi never uses. |

| [`proposing-plans.md`](skills/proposing-plans.md) | Paxi proposes fitting plans itself at the end (need before product, based on section 8 of the [advisor plan](../../documentation/baselhack/plans/advisor-plan.md)): one to three plans with the matching Pax solution, no invented amounts, premiums or guarantees, and a suitability check before fund-linked products. A Pax colleague then assesses Paxi's proposals and gets in touch with the final assessment. |

The skills are concise translations of their sources, not the sources themselves. Where the research proposes something the team decided differently (asking once more after a first refusal), the persona's decision applies. To add a skill, create a new `skills/<name>.md` with the front matter and restart the server; set `assigned: false` to keep a draft out of the prompt.

## Customer portfolio (`questionnaire.json`)

`questionnaire.json` lists everything Pax needs to know about a customer: 53 fields in seven sections (person, family, work and income, living, provision and assets, goals, suitability check). It covers the backend's own intake list on `main` (`intakeQuestions()` in `packages/domain`); each field's `contractPath` names the backend path it maps to. Each field has a casual du-form question, a type (`string`, `date`, `integer`, `money`, `enum`, `boolean`), a tier and, where available, the matching path in the shared contracts (`contractPath`) and its source.

| Tier | Fields | Who collects them |
|---|---|---|
| `core` | 14 | Paxi, in the first conversation. Paxi does not wrap up while one is open. |
| `extended` | 17 | Paxi, when they fit the conversation. Paxi does not wrap up before they are known or handed to a colleague. |
| `planning` | 11 | What the calculation needs (needs in case of death or disability, protection term, pension fund pension, retirement need, savings, affordable premium). Paxi asks them compactly after the above if the person has time; otherwise a colleague completes them. |
| `colleague` | 3 | Technical calculation assumptions (expected return, planning horizon, debt treatment). A colleague sets them with the person; Paxi never asks them. |
| `suitability` | 8 | Only a Pax colleague (legally required suitability check before investment-linked insurance). Paxi never asks them. |

Sources: the backend's intake list and question texts on `main`, the shared contracts (`InsuranceIntakeSchema`, `PersonSchema`, `GoalSchema`), the Pax pension analysis, the public pension analysis test inputs and the Pax suitability check. The prompts, the tool enums, the validation and the log are all built from this file, so changing it is enough to change what Paxi asks.

## Example conversations

`examples/` holds real test conversations from the demo. `conversation-gpt-live.json` and `conversation-elevenlabs.json` are pseudonymised (name and personal details replaced with demo values; everything else unchanged):

- [`conversation-gpt-live.json`](examples/conversation-gpt-live.json): OpenAI GPT-Live, German, 26 turns. Shows the conversational style and nine details filled in from the conversation, including inferred ones (relationship year, child's birth year) and the extracted life context.
- [`conversation-stress-test.json`](examples/conversation-stress-test.json): GPT-Live, German, 142 turns, unchanged. A tester plays an invented, deliberately provocative persona ("Peter"). Shows extraction of 23 details, Paxi's summary with corrections and its own plan proposals, and, from 9:18 on, the behaviour before the fix "a goodbye is final" (Paxi kept asking after saying goodbye).
- [`conversation-elevenlabs.json`](examples/conversation-elevenlabs.json): recorded with the former ElevenLabs integration (removed again), 46 turns. Same log format. Starts in French, switches to German on request, and shows how Paxi handles off-topic and provocative input.

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

Paxi does not save small talk during the call, because every save makes the model pause. When the conversation ends, the server sends the transcript to the backend model once (`conversation-context.mjs`). It writes a `context` section into the log: a short summary, notes per topic (hobbies, work, family, housing, plans, finances, health, other), `proposals` (the plans Paxi proposed, with need, Pax solution and the person's reaction, for the colleague's assessment) and `possible_needs` as further starting points for a Pax colleague. Always in German.

## How details are saved

Paxi does not save anything itself; it just has the conversation. After each turn of the person, the server sends the latest transcript to the backend model (`answer-extractor.mjs`, about 3 to 10 seconds) and stores every detail the person stated or that clearly follows from it ("seit drei Jahren verheiratet" becomes `relationship_since_year`, "seit Juli eine Tochter" becomes the child's birth year). Every value is validated against `questionnaire.json` first. The browser polls `/progress`, shows the new answers and gives Paxi a quiet note of what is already known and what is still open, so Paxi never asks twice and does not wrap up too early.

Refusals are recognised from the transcript too: one refusal marks the detail `declined_once` (Paxi may ask gently once more later), a second one marks it `declined` and adds it to `humanFollowUp` for a Pax colleague.

The previous approach, where the model saved each confirmed detail through a tool call, lost details: the model only called the tool now and then, and Paxi worked through the list like a form.

## Priorities from outside

Other parts of the app can steer Paxi's questions, for example when a calculation needs the income first. Field IDs come from `questionnaire.json`:

- in the browser: `paxi.start({ priorities: [...] })` or `paxi.prioritize([...])` during the call
- on the server: `POST /api/conversations/:sessionId/priorities` with `{ "fields": [...], "source": "advisor" }`

Paxi gets a quiet note to steer there at the next natural moment, without cutting off what the person is telling. Prioritised details then come first in every progress note, and the log records each change as `priorities_set`. In the demo, tap a field (★) or open `/?priorities=annual_gross_income_chf,has_pension_fund`.

## Intro

Every call starts with the recorded intro `public/intro.mp3` (four short clips: "Hi, ich bin Paxi! In welcher Sprache kann ich dir helfen?", then the same question in French, Italian and English; the text is in `welcome.txt`). It is normalised to the same loudness as Paxi's voice (-25 LUFS). The browser plays it itself while the microphone already runs, so the person can interrupt it just by speaking. As soon as the microphone hears a voice clearly louder than the intro's own echo (measured during its first second), the intro drops to 20 % volume; as soon as the person's first words show up in the transcript, it stops and Paxi answers in their language. If the transcript does not confirm real words within 2.5 seconds, the volume comes back. Without headphones, the intro can echo back through the microphone; transcript text that mostly repeats the intro's words is ignored.

A GPT-Live audio fixture was tried first, but GPT-Live drops all input while a fixture plays, so it could not be interrupted. If `public/intro.mp3` is missing, Paxi says `welcome.txt` live instead.

To replace the intro, combine new clips into `public/intro.mp3` and update `welcome.txt`:

```bash
ffmpeg -i w1.mp3 -i w2.mp3 -i w3.mp3 -i w4.mp3 -filter_complex "[0:a]apad=pad_dur=0.35[a0];[1:a]apad=pad_dur=0.3[a1];[2:a]apad=pad_dur=0.3[a2];[a0][a1][a2][3:a]concat=n=4:v=0:a=1[c]" -map "[c]" -ac 1 -b:a 96k -af loudnorm=I=-25:TP=-3 public/intro.mp3
```

## Conversation rules

- **Paxi knows it is an agent and leads.** Paxi is open about being Pax's digital assistant (an AI), says at the start what the conversation is for and that it takes about ten minutes, and moves every turn towards something still open. Small talk gets at most one follow-up; off-topic remarks get a short, light answer and Paxi steers back in the same turn (`persona.md`, "Driving the conversation").
- **A conversation, not a checklist.** Paxi asks open questions that invite a story, follows what the person brings up and never asks for what is already known (`persona.md`).
- **Paxi takes the initiative.** After 8 seconds of silence, Paxi asks a light question, asks for an open detail or picks up an earlier topic (at most twice in a row); before a language is chosen, it asks again in all four languages.
- **Today's date.** Every session gets today's date (Europe/Zurich) in the Live and backend prompts, so ages and durations are calculated correctly.
- **Declined details.** If the person does not want to give a detail, Paxi accepts it, changes the topic and asks gently once more later; a second refusal goes to a Pax colleague (see above).
- **Goodbyes are final.** Paxi does not start wrapping up on its own while core or extended details are open, but a wish to end always wins. When the person says goodbye ("Tschüss", "Tschau", "Uf Wiederluege", …), Paxi gets a note to thank them, mention the colleague and say goodbye without another question. When Paxi says goodbye, the app ends the call about 7 seconds later; open details go to a colleague via the log. Only if the person keeps talking about something else does the conversation continue.
- **Fast mode.** If the person is in a hurry, Paxi drops the small talk and asks the open core details one short question at a time.
- **Inactivity.** Breathing, background noise and fillers ("[sniff]", "mhm", "ähm") do not count as speech, and neither does microphone noise, so Paxi's own initiative after 8 seconds is not delayed by them either. If the person says nothing for 30 seconds, Paxi says it will close the call in about 30 seconds and that they can simply continue later. After another 30 seconds of silence it says goodbye and closes the call (log status `inactive`). `paxi.start({ resume: conversationId })` continues the same conversation and log: Paxi welcomes the person back and continues with what is still open. The demo does this on the next tap.
- **"A colleague of mine".** Paxi never says "Pax specialist" or "Fachperson"; it always says that a colleague of theirs will get in touch.

## Language and voice switch

Paxi greets in German, French, Italian and English, asks which language the person prefers and tells the person to simply start speaking in their language. GPT-Live fixes the voice for each session, so switching voices works like this:

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
- `status: "captured"` means a value was extracted from the transcript and passed validation; it may be inferred and is not an explicit confirmation by the person. It is not yet the confirmed case state (I02) from the [interface contracts](../../documentation/baselhack/plans/interface-contracts.md).
- Only local origins can create sessions. Add authentication before deploying anywhere else.

## Troubleshooting and verification

| Symptom | Check |
|---|---|
| Microphone cannot start | Allow microphone access and use localhost or HTTPS. Start from a click/tap and check that another application is not blocking the device. |
| HTTP 403 | Open the demo using `http://localhost:<PORT>`; the Origin must match exactly. |
| Page loads but a call fails | Check `OPENAI_API_KEY`, model access and the server's error output. The page can load without credentials. |
| Answers appear late or are missing | Extraction is asynchronous. Check server output for `Answer extraction failed`; inspect the transcript and ensure the field is not suitability-only. |
| No final context yet | Wait for the post-close extraction and reload the log. Check for `context.error` or `Context extraction failed` in server output. |
| Italian uses the German voice | Configure `LIVE_VOICE_ID_IT` and restart; see [Custom voices](#custom-voices). |
| Resume returns 404 | Supply the original conversation ID. Only non-active logs can be resumed; an abruptly terminated server may leave a log marked active. |

Run `npm test` inside `code/voice-agent` for the automated log/validation and language-detection tests. These do not make a live voice call. For a manual smoke test, start the demo, allow the microphone, speak in one supported language, give a name and an income, and check the transcript, captured answers and JSON log. Switch language, stop the call and resume the same conversation; verify that its ID and previous answers are retained. A live smoke test uses the configured API account.

## Data handling and deployment limits

The prototype persists transcripts, extracted personal details, refusal notes, usage/events and life context as local JSON; it does not persist raw audio files. Audio is sent to the Live service, and transcript text is sent to the backend model for extraction. Git exclusion of `data/` prevents normal commits, but does not provide encryption, access control or a retention policy.

The server has a local Origin check on writes, no user authentication, and unauthenticated questionnaire/progress/log reads. It has no automatic log deletion. Before a hosted integration, implement authentication and conversation ownership checks, agree consent/retention handling, and configure the intended origin and HTTPS. The current implementation is a local demo, not the shared confirmed case store.
