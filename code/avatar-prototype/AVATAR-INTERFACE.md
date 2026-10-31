# Avatar interface: voice → avatar

Handoff for Dario (Voice). Lukas owns the avatar side. This extends **I06 VoicePlaybackEvent** in [interface-contracts.md](../../documentation/baselhack/plans/interface-contracts.md) with the technical work states (listening/thinking) the contract already allows, plus one new event: `emotion`.

## In one sentence

The voice layer gives the avatar **the audio it plays** and a stream of **`AvatarEvent`s**. It never sets the face directly.

```js
import { mountPaxAvatar } from "./pax-avatar.js";
import { createAvatarController } from "./pax-avatar-controller.js";

const avatar = createAvatarController(mountPaxAvatar(hostElement));
avatar.attachAudio(remoteStream);   // MediaStream or <audio> element that the user hears
avatar.handle(event);               // every AvatarEvent, in the order they happen
```

Types: [`pax-avatar.d.ts`](pax-avatar.d.ts) and [`pax-avatar-controller.d.ts`](pax-avatar-controller.d.ts). Reference implementation for GPT-Live: [`openai-realtime-adapter.js`](openai-realtime-adapter.js).

## The three events

| Event | Send when | OpenAI Realtime source |
|---|---|---|
| `{ type: "activity", state: "listening" }` | The user starts speaking | `input_audio_buffer.speech_started` |
| `{ type: "activity", state: "thinking" }` | The user finished; the reply is being prepared | `input_audio_buffer.speech_stopped` |
| `{ type: "activity", state: "idle" }` | Nothing is happening (call ended) | on close |
| `{ type: "emotion", emotion, playbackId }` | Whenever a tone is known, ideally before `playback started`; send every answer, the avatar queues and stabilises | `set_emotion` tool call (`response_id` as `playbackId`) |
| `{ type: "playback", event: "started", playbackId }` | Audio is **actually audible**, not just requested | `output_audio_buffer.started` |
| `{ type: "playback", event: "ended", playbackId }` | Audio played to the end | `output_audio_buffer.stopped` |
| `{ type: "playback", event: "cancelled", playbackId }` | Audio was cut off (barge-in, stop, new turn) | `output_audio_buffer.cleared` |
| `{ type: "playback", event: "error", playbackId }` | Playback failed | — |

`emotion` values: `neutral`, `acknowledging`, `curious`, `explaining`, `reassuring`, `empathetic`, `pleased`, `recovering`, `presenting_offer`. `turnId` and `replyId` from I06 may be added to `playback` events; the avatar does not need them but passes them through.

## What the avatar guarantees

- **No twitching on false barge-ins.** While a playback is running, `listening`/`thinking` do not change the face. Only `playback cancelled` interrupts the reply visually.
- **Late events are ignored.** Any event for a `playbackId` that already ended or was cancelled is dropped (`handle()` returns `false`).
- **Early emotions wait for the reply.** An `emotion` that arrives while the user speaks or the advisor thinks (e.g. from the input transcript trigger) is queued and shown when playback starts. Otherwise it is shown right away.
- **No flicker from classifiers.** While the advisor has the turn, `neutral` never replaces a stronger emotion, and other changes apply at most every 2 s (the latest one wins). Send every answer; the avatar filters.
- **Relax after the reply.** The emotion is held ~1.5 s after playback ends, then the face relaxes to neutral. A new user turn starts from neutral.
- **Calm expression motion.** Each expression has a subtle tilt, breath, nod or sway; warm expressions lift once on entry and recovery briefly resets. Audio only adds tiny eye emphasis when explaining; it never drives body motion. Reduced-motion preferences suppress decorative motion and blinking while preserving all eye shapes and decorations.


## GPT-Live prototype mapping

The event shapes above remain the contract. The reference adapter uses `gpt-live-1` for voice and native Decisions on `gpt-6-luna`. Transcript triggers ask `reply_emotion` on `session.input_transcript.delta` and `emotion` on `session.output_transcript.delta`. Completed `decision.event` choice answers become `{ type: "emotion", emotion, playbackId }`, associated with the source delta's playback ID. Source event indexes prevent older answers from overwriting newer answers within each direction. Invalid, missing, failed, or stale answers leave the face unchanged.

Live delegates pension-picture and human-advisor requests to a `ui_action` choice. A small browser action registry logs these demos and answers the matching delegation once through `session.commentary.append`. Actions fail safely after 3 seconds; a 10-second watchdog answers stalled decisions. Malformed messages and nonfatal API errors are logged without stopping voice. Session creation retries once with voice only if a 4xx rejects Decisions configuration; the adapter logs the disabled emotions/actions flag. No event filtering is configured.

Live has no speech-start/stop or playback boundary events. Listening/thinking and playback segments still come from local audio energy (600 ms silence). Segment endings are approximate and do not identify server barge-in; local close emits `cancelled`. Emotion decisions may arrive after playback starts. Realtime VAD/noise-reduction fields remain omitted; browser echo cancellation and noise suppression remain enabled. See [README.md](README.md#live-api-connection) for the connection and official sources.

## About the interruptions

"Interrupted" is decided by the voice layer, not by the avatar; the avatar only shows `playback cancelled`. With GPT-Live there are no server-side VAD or noise-reduction settings (they were Realtime-only and are removed from `server.mjs`). What remains:

| Cause | Fix |
|---|---|
| The advisor hears its own voice from the laptop speakers | Browser echo cancellation (on in the adapter); a **headset** at the demo |
| Room noise | Browser noise suppression (on in the adapter); a headset or a quieter spot |
| Face twitches on noise or echo | Already handled: during playback the avatar ignores `listening`/`thinking` |

## Integrating into the Angular app

1. **Copy the avatar files** into the app, e.g. `src/app/avatar/`: `pax-avatar.js`, `pax-avatar-controller.js` and both `.d.ts` files. They are plain ES modules with type declarations, no build step or dependency.
2. **Mount it in a component, outside the Angular zone** (the avatar animates every frame; inside the zone that would trigger change detection 60 times per second). Multiple avatars can coexist: each mount gives its SVG definitions unique IDs.

   ```ts
   import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from "@angular/core";
   import { mountPaxAvatar, type PaxAvatarRig } from "./pax-avatar.js";
   import { createAvatarController, type AvatarController } from "./pax-avatar-controller.js";

   @Component({ selector: "pax-avatar", standalone: true, template: `<div #host></div>` })
   export class PaxAvatarComponent implements AfterViewInit, OnDestroy {
     @ViewChild("host", { static: true }) host!: ElementRef<HTMLElement>;
     private zone = inject(NgZone);
     private rig?: PaxAvatarRig;
     controller?: AvatarController;

     ngAfterViewInit() {
       this.zone.runOutsideAngular(() => {
         this.rig = mountPaxAvatar(this.host.nativeElement);
         this.controller = createAvatarController(this.rig);
       });
     }
     ngOnDestroy() { this.rig?.destroy(); }
   }
   ```
3. **Hand the controller to the voice service** (e.g. an `AvatarService` holding the `AvatarController`). The voice code calls only `attachAudio(stream)` once per call and `handle(event)` for every AvatarEvent. Nothing else of the avatar is public.
4. **Move `POST /session` into the NestJS backend** (Dario's VoiceAdapter). It takes `{ sdp }` from the browser, calls `POST https://api.openai.com/v1/live/sessions` with the session config from `server.mjs` (instructions, voice, Decisions delegation, emotion triggers) and returns the SDP answer. The API key never reaches the browser. Keep the voice-only retry so a rejected Decisions config never breaks voice.
5. **Port the adapter** (`openai-realtime-adapter.js`) into the voice service or reuse it as is; its only output is `onAvatarEvent(ev)`, `onAudioStream(stream)` and `onTranscript(delta)`. Replace the demo action registry with real app actions (show the Vorsorgebild, request a human advisor).

## Open decision

Who picks `emotion`: today Luna Decisions transcript triggers (`gpt-6-luna`), or later Earnie's backend as a field of the AgentReply? The avatar does not care; both send the same `emotion` event.
