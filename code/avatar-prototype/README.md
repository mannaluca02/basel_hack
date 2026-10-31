# Avatar prototype (throwaway)

Square Pax Beratercharakter ("Soft Block"): eyes only, no mouth. Emotions via eyes and body, speech via squash & stretch.

| File | What |
|---|---|
| `pax-avatar.js` | The rig. `PaxAvatar.mount(el)` → `setEmotion(key)`, `attachStream(mediaStream)`, `setLevelSource(fn)` |
| `index.html` | Design demo, open directly in the browser (emotion buttons, fake speech, mic, scripted conversation) |
| `realtime.html` | Live test against OpenAI Realtime (WebRTC) |
| `server.mjs` | Dev server: static files + `POST /session` mints a short-lived client secret |

## Run the live test

```
# OPENAI_API_KEY in the repo-root .env or the environment
node code/avatar-prototype/server.mjs
# → http://localhost:8787/realtime.html, then "Gespräch starten" and allow the microphone
```

Optional: `OPENAI_REALTIME_MODEL` (default `gpt-realtime`), `OPENAI_REALTIME_VOICE` (default `marin`), `PORT`.

## How the avatar stays in sync

| Avatar | Source |
|---|---|
| Body motion while speaking | Loudness of the remote WebRTC audio track, the same stream the `<audio>` element plays, so no offset |
| `listening` | `input_audio_buffer.speech_started` |
| `thinking` | `input_audio_buffer.speech_stopped` until the reply audio starts |
| Emotion of the reply | Model calls the `set_emotion` tool at the start of each reply (enum: neutral, happy, empathetic, concerned, surprised, celebrating) |
| I06 `VoicePlaybackEvent` started / ended / cancelled | `output_audio_buffer.started` / `stopped` / `cleared` (WebRTC only) |

If a response contains only the `set_emotion` call and no speech, the page sends `function_call_output` and `response.create` so the model continues speaking (max. 2 follow-ups per user turn).
