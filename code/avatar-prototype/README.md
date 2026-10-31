# Avatar prototype (throwaway)

Square Pax Beratercharakter ("Soft Block"): eyes only, no mouth. Eleven expressions via eyes, blush, and calm characteristic motion.

**Voice integration: read [AVATAR-INTERFACE.md](AVATAR-INTERFACE.md).**

| File | Owner | What |
|---|---|---|
| `pax-avatar.js` | Lukas | `createPaxAvatar(el)`: events, audio, drawing and animation |
| `pax-avatar.d.ts` | Lukas | TypeScript types for Angular |
| `openai-realtime-adapter.js` | Dario | Reference adapter: GPT-Live (WebRTC) → AvatarEvents |
| `server.mjs` | Dario | Dev server: static files + `POST /session` exchanges SDP with the Live API |
| `index.html` | — | Design demo: face buttons, fake speech, mic, scripted conversation as AvatarEvents |
| `expressions.html` | — | Live eleven-expression review sheet, focused view and replay |
| `realtime.html` | — | Live test against GPT-Live |

```js
import { createPaxAvatar } from "./pax-avatar.js";
const avatar = createPaxAvatar(hostElement);
avatar.attachAudio(remoteStream); // stream, media element, level callback, or null to detach
avatar.handle(event);
// Design/demo: avatar.show("pleased"); always replays entry motion.
// Read avatar.state; call avatar.reset() between sessions and avatar.destroy() on teardown.
```

## Expressions and listening

The eleven faces follow the expression sheet: `neutral` has round dots; `listening` holds an attentive tilt; `acknowledging` uses flattened ovals and a slow nod; `curious` has asymmetric eyes and a head tilt; `thinking` looks up with independent flat lids and sequential thought dots; `explaining` uses tall alert ovals; `reassuring` uses soft wide ovals; `empathetic` lowers its gaze beneath slanted lids; `pleased` closes its eyes into arcs with blush; `recovering` resets with asymmetric dots; `presenting_offer` adds green twinkling stars to the welcoming arcs.

`listening` and `thinking` are activity faces. The other nine are reply emotions. Live trigger descriptions distinguish acknowledgment, explanation, reassurance, concern, clarification, correction, welcome, and an actually presented offer or result. Input decisions prepare the upcoming reply.

The body moves subtly for each expression: slow breathing and sway, a small listening/curiosity tilt, a gentle acknowledgment nod, and a single small lift on entering the welcoming or offer expressions. Recovery gives a brief tiny shake, then settles. Translation stays within four viewBox units, rotation within six degrees, and scale within three percent. Shadow size follows the lift. Reduced-motion preferences suppress decorative motion and blinking, keeping the expression visible. Audio never drives body motion; explaining can react very slightly through eye height.

Open [expressions.html](expressions.html) for all eleven live expressions, or add `?only=curious` for a focused view. Each tile links to the interactive demo and offers a replay button for entry motion. Multiple mounts have unique SVG IDs. The microphone demo explicitly enters listening mode.

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
