# Paxi's avatar

Square Pax Beratercharakter ("Soft Block"): eyes only, no mouth. Eleven expressions via eyes, blush, and calm characteristic motion. The app copies the renderer at start and build (`code/apps/web/scripts/sync-voice-avatar.mjs`); Dario's voice agent serves it under `/avatar`.

**Voice integration: read [AVATAR-INTERFACE.md](AVATAR-INTERFACE.md).**

| File | Owner | What |
|---|---|---|
| `pax-avatar.js` | Lukas | `createPaxAvatar(el)`: events, audio, drawing and animation |
| `pax-avatar.d.ts` | Lukas | TypeScript types for Angular |
| `pax-avatar.test.mjs` | Lukas | Timing regression tests, no microphone or API calls: `node --test code/avatar-prototype/pax-avatar.test.mjs` |

```js
import { createPaxAvatar } from "./pax-avatar.js";
const avatar = createPaxAvatar(hostElement, { emotionHoldMs: 5000 });
avatar.attachAudio(remoteStream); // stream, media element, level callback, or null to detach
avatar.handle(event);
// Design/demo: avatar.show("pleased"); always replays entry motion.
// Read avatar.state; call avatar.reset() between sessions and avatar.destroy() on teardown.
```

`emotionHoldMs` sets the minimum interval between reply-emotion changes per instance (default `5000`, `0` disables it). Activity states cannot bypass it; the latest candidate waits until expiry. Repeated answers do not extend the hold.

## Expressions and listening

The eleven faces follow the expression sheet: `neutral` has upright pill eyes; `listening` holds an attentive tilt; `acknowledging` uses flattened pills and a slow nod; `curious` peers through a monocle on the right eye with a head tilt; `thinking` looks up with independent flat lids and sequential thought dots; `explaining` uses tall alert pills; `shocked` stares with wide pills beneath a pop-up exclamation mark; `empathetic` lowers its gaze beneath slanted lids; `pleased` closes its eyes into arcs with blush; `recovering` resets with asymmetric pills; `presenting_offer` adds green twinkling stars to the welcoming arcs.

`listening` and `thinking` are activity faces. The other nine are reply emotions. Live trigger descriptions distinguish acknowledgment, explanation, genuine shock, concern, clarification, correction, welcome, and an actually presented offer or result. Input decisions prepare the upcoming reply.

The body moves subtly for each expression: slow breathing and sway, a small listening/curiosity tilt, a gentle acknowledgment nod, and a single small lift on entering the welcoming or offer expressions. Recovery gives a brief tiny shake, then settles; shock starts with a quick upward startle, then freezes while the body shrinks to 85% as if stepping back. Translation stays within four viewBox units, rotation within six degrees, and scale within three percent. Shadow size follows the lift. Reduced-motion preferences suppress decorative motion and blinking, keeping the expression visible. Audio never drives body motion; explaining can react very slightly through eye height.

Multiple mounts have unique SVG IDs.
