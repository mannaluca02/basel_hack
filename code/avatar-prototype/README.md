# Avatar prototype (throwaway)

Square Pax Beratercharakter ("Soft Block"): eyes only, no mouth. Emotions via eyes and blush; the body stays at a fixed height and size.

**Voice integration: read [AVATAR-INTERFACE.md](AVATAR-INTERFACE.md).**

| File | Owner | What |
|---|---|---|
| `pax-avatar.js` | Lukas | Drawing + animation. `mountPaxAvatar(el)` |
| `pax-avatar-controller.js` | Lukas | **The interface for voice**: `attachAudio(source)`, `handle(AvatarEvent)` |
| `pax-avatar.d.ts`, `pax-avatar-controller.d.ts` | Lukas | TypeScript types for Angular |
| `openai-realtime-adapter.js` | Dario | Reference adapter: GPT-Live (WebRTC) → AvatarEvents |
| `server.mjs` | Dario | Dev server: static files + `POST /session` exchanges SDP with the Live API |
| `index.html` | — | Design demo: face buttons, fake speech, mic, scripted conversation as AvatarEvents |
| `realtime.html` | — | Live test against GPT-Live |

## Expressions and listening

`empathetic` uses open, softly angled eyes. `concerned` is more serious. `reassuring` is a small calm smile, `curious` uses a questioning gaze and wider eyes, and `unsure` uses an asymmetric squint. The Live trigger choices distinguish personal distress, concrete risk, reassurance, and clarification.

The body never bobs, nods, rotates, or stretches vertically, including during speech, emotion transitions, and celebration. A gentle horizontal sway accompanies eye movement and blinking, including while listening. Reduced-motion preferences suppress the decorative drift. Input emotion decisions still prepare the upcoming reply.

The microphone demo explicitly enters listening mode. Audio levels remain available to the UI but do not move or resize the body.

## Run

```
# OPENAI_API_KEY in the repo-root .env or the environment (only needed for realtime.html)
node code/avatar-prototype/server.mjs
# → http://localhost:8787/index.html and /realtime.html
```

The pages use ES modules, so they need the server; double-clicking the HTML file does not work.

The voice model is fixed to `gpt-live-1`. Optional env vars: `PORT`, `HOST` (default `127.0.0.1`), `OPENAI_REALTIME_VOICE` (default `marin`). `OPENAI_REALTIME_MODEL`, `OPENAI_NOISE_REDUCTION`, and `OPENAI_VAD_THRESHOLD` are no longer used.

## Live API connection

The browser posts `{ sdp }` to `/session`. The server calls `POST https://api.openai.com/v1/live/sessions` with `{ session, transport: { type: "webrtc", sdp } }` and returns the JSON SDP answer (HTTP 201). There is no `session.type`, ephemeral secret, or `/v1/realtime/calls` request. WebSockets are also supported at `wss://api.openai.com/v1/live/sessions`, but this page uses WebRTC.

`gpt-live-1` handles voice; native Decisions delegation uses `gpt-6-luna` (additional Decisions usage). Two transcript triggers choose `reply_emotion` for customer input and `emotion` for advisor output. The adapter reads `decision.event` → `decision.completed` choice answers and emits the existing emotion AvatarEvent. Results are ordered by source transcript event separately for each direction; stale or invalid answers leave the face unchanged.

For a request to see the pension picture or speak to a human advisor, Live delegates the `ui_action` choice. The adapter matches `session.delegation.created`, runs the selected demo action (logging only), and sends one German result through `session.commentary.append` with the delegation ID. These demos do not display a picture or contact anyone. Actions time out after 3 seconds; missing Decisions results time out after 10 seconds. Failure results let Live continue the conversation. Malformed events and nonfatal API errors are logged and ignored. The data channel uses the default unfiltered server events, including both transcript deltas and Decisions events.

If session creation gets a 4xx mentioning triggers, decisions, or delegation, the server retries once with voice only and returns `X-Avatar-Decisions: disabled`; the adapter logs “emotions/actions disabled”. The API rejection is recorded in the server log with the key redacted. Startup and shutdown use `session.started` / `session.closed`.

Live does not expose Realtime's configurable `audio.input.noise_reduction` or `turn_detection`, so those fields are omitted. Browser echo cancellation, noise suppression, and automatic gain control remain enabled. Live has no equivalent of Realtime speech-start/stop or output-buffer playback boundary events. The adapter detects local microphone and remote audio energy, with 600 ms silence splitting segments. AvatarEvent shapes stay unchanged, but segment boundaries are approximate; natural pauses and server interruptions both produce `ended`. Closing active playback produces `cancelled`. Emotion decisions can finish after speech starts, so emotion-before-playback is not guaranteed with Live.

Official OpenAI documentation:
- [GPT-Live 1 model](https://developers.openai.com/api/docs/models/gpt-live-1)
- [WebRTC connection](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Create session schema](https://developers.openai.com/api/reference/resources/live/methods/create)
- [Session events and lifecycle](https://developers.openai.com/api/docs/guides/live-conversations)
- [Decisions with GPT-Live](https://developers.openai.com/api/docs/guides/decisions-voice)
- [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
