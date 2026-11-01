# Paxi HTML presentation

Three main slides plus two supporting slides. English, 16:9, target runtime 2:30 + 30 seconds buffer. See [storyboard and speaker draft](STORYBOARD.md) and [feature inventory](FEATURES.md).

## Preview

Serve the **repository root**, so the deck can load the existing Paxi component and Pax logo:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766/presentation/. ES modules require HTTP; opening the file directly will not work reliably. Internet is not required for the deck once the local media and QR are supplied.

## Presenter controls

| Key | Action |
|---|---|
| Right / Page Down | Advance one animation stage, resume playback, or move the slide band forward |
| Left / Page Up | Reverse one animation stage; return to the previous slide at its boundary |
| F | Toggle full screen; pointer hidden in full screen |
| 1 / 2 / 3 | Play/pause that phone on the demo slide |
| Space | Pause active clip, or play the first clip |
| R | Reset all three phones to locked |
| Home | Cover |
| End / Escape | QR closing slide (browser may also exit fullscreen) |
| A | Architecture backup |
| B | Features / limitations backup |

Slide 2 begins with three dimmed lock screens. Press Next to start each chapter: lock screen brightens → swipe up into a simulated browser → fade into full-screen local video → fade to white → Paxi drops into the centre with stacked recap text. A completed phone stays on its recap; the next phone waits for the presenter. Clicking a phone starts or pauses/resumes it; click a completed phone to replay. Only one can play at a time; leaving the slide cancels active transitions and pauses media. Re-entering slide 2 resets all phones to their dimmed lock screens. Browser controls are omitted. Backup slides cannot be reached accidentally with the forward key. Hashes #1 through #5 open individual slides.

## Media and QR setup

Edit [config.js](config.js). Default video names:

- `media/placeholder-hello.mp4` — first interaction and languages
- `media/placeholder-context.mp4` — context and growing visuals
- `media/placeholder-next-steps.mp4` — offer and next steps

These are moving, violet demo clips with a coloured moving shape and a progress bar, labelled DEMO PREVIEW. Durations are 20 seconds (hello), 25 seconds (context) and 20 seconds (next steps). Replace their `src` values with real recordings and set `placeholder: false` for each final clip.

Use consistent portrait crops; export recordings with app controls only and no video-player chrome. The frame uses `object-fit: contain` to preserve the original UI. Prefer H.264 MP4 with AAC audio for broad compatibility. Add poster paths and local WebVTT English captions if available. If a video cannot play, the phone falls back to its chapter recap.

The draft uses `https://example.com/paxi-demo` and a local temporary QR with a prominent REPLACE overlay. Before presenting, set `demoUrl` to the public demo address, replace `qrImage` with a local QR image generated from that exact address, and set `qrTemporary` to `false`. Scan the final QR with a phone from the back of the room before presenting.

The Larpers team row uses animated SVG portraits derived from the user-labelled reference photos: Luca, Lukas, Dario, Valentin, Ernie, plus Paxi. Presentation-only SVG features preserve the cap, glasses, hair, beard and approximate visible skin tones. The original photos stay outside the repository. Paxi uses Lukas’s unmodified mouthless SVG and standard animations. Team heads have round coloured eyes: Luca/Lukas hazel green-brown, Dario/Valentin light blue, Ernie brown. The closing slide has a centred borderless inline SVG QR that gently expands, with the team below it and no large Paxi. Larpers appears on its own bold line above a small heart and the Vibe coded line. No heart or written demo URL.

Before presenting: add the media, verify slide-three URL and QR, confirm the real offer shown, test audio/fullscreen in the actual browser, and rehearse the full 2:30 sequence.

## iPhone layout and animation

Slide two retains the main title above three original SVG iPhone-style frames. Each screen viewport uses 390 × 844 proportions, matching the supplied screenshot. Videos fill the browser content area with `object-fit: cover`; Chrome and battery remain during startup/playback, then disappear for the full-white recap. Chrome’s original interface comes from the user-supplied screenshot, with a live clock and presentation URL overlay. Export final clips as page-content recordings without duplicate browser/status chrome.

Slide two uses the same warm background as the other slides. During active demos it dims to almost black, with a bright white spotlight and edge light behind the active phone. The warm background returns only when all three demos are complete. The lock screens display live time/date in Europe/Zurich, refreshed every second, with Pax / BaselHack / OpenAI wallpapers from left to right. See [logo sources](media/brands/README.md). Focus is indicated by a diffuse spotlight behind the active phone; the other phones are never greyed out. Unlock runs for 1.9 seconds before video begins. Each recap takes over the entire screen, removing Chrome and status overlays before Paxi falls. Its separate floor shadow stays on the ground and grows from zero to full size in sync with the drop.

## Slide motion and pointer gaze

Slides form one contiguous vertical band. The entire band moves over 700 ms, so outgoing and incoming slides share a moving edge. Forward/backward keys and the discreet navigation buttons move through deterministic stages: locked → startup → playback → recap. Back from a recap restores paused playback, then startup, then the lock screen; it works even with a phone focused. Forward resumes paused playback. The viewport uses overflow clipping so focusing a phone cannot scroll the band. Reduced-motion preferences skip the slide motion. All visible avatars respond to active mouse/pen movement with bounded eye offsets and subtle whole-head movement, then resume their normal idle animation after 900 ms without movement. Portrait irises move inside their round eyes; Paxi keeps its standard expressions and body animation.

The neutral spotlight uses CSS radial-gradient layers and dynamic position variables, informed by the supplied [spotlight-effect reference](https://www.wearedevelopers.com/magazine/637-creating-a-spotlight-text-effect-with-css-and-javascript). The presentation targets the active phone rather than following the cursor with the light.

The phone image fills the area behind the SVG stencil with slight overscan, so no white image margins appear at the frame. The browser/video translates into place at its final size rather than scaling up. Lock-screen quick actions use vector flashlight and camera glyphs instead of text symbols. The QR follows a low arc with vertical squash/stretch and slight horizontal widening; it stays below its starting position so it does not approach the title. It has no skew or perspective, and has a round floor shadow with a solid oval shape that follows its horizontal position and adjusts to its height. Team heads retain mouse-following irises on the closing slide.

### Placeholder media format

MP4 container, H.264 video, 390 × 640 pixels, 30 fps, yuv420p, AAC audio at 48 kHz. Each placeholder includes a quiet synthesized demo soundtrack. The clips play inside the browser page, not over its chrome. Playback starts immediately during the 1.9-second browser entrance; those seconds are included in each clip's duration. All three files are local, and playback is unmuted at 65% volume. The combined 65 seconds of video leaves about 40 seconds for narration on the 105-second demo slide.

Inactive phone screens adapt to ambient light with a 330 ms fade and independent random delays of 25–140 ms. The backlight is broad and subdued. Visible navigation arrows are removed; use Left/Right or Page Up/Page Down.

Backlight uses the warm slide background colour (#f9f7f0), centred behind the phone with a symmetric 18 px margin and a 30 px feathered edge; clipping prevents light from reaching the heading. Eyes and head offsets are interpolated on animation frames during mouse movement, then reset to idle after 900 ms without movement. Eye tracking remains responsive while whole-head movement uses a slower inertial response.

### Texture and QR scan check

A stationary, low-opacity SVG `feTurbulence` tile adds subtle grain to warm and dark slide backgrounds and the close-fitting phone light boxes. There is no outer bloom around the light box, and Tab focus does not draw a selector around the phones. Keyboard navigation is retained.

`showQrReplace: false` hides the REPLACE overlay for scan testing. The QR still encodes `https://example.com/paxi-demo`; replace the SVG and `demoUrl` before the pitch. `qrTemporary` remains true until the real destination is supplied. The texture approach uses the SVG-noise technique discussed in the user-provided [Grainy Gradients reference](https://css-tricks.com/grainy-gradients/); direct article retrieval was blocked during this edit.

The QR body and shadow share a continuous animation phase. Speed and arc width drift toward randomly selected targets on each half-swing; a slight sideways tilt accompanies the arc without perspective/skew. The floor shadow stays grounded, follows horizontal motion, and changes width/opacity with height. After a phone loses focus, the backlight fades for 650 ms; after the final phone completes, the background starts returning to light after 680 ms. Starting another phone cancels that pending restoration.


### Final stage layout

Backlight softness is fixed at 30 px; the tuning slider is removed. During the phone sequence the title fades away, the row moves up to the centre, and the phones step slightly upward from left to right. Dark mode stays on between phones and ends only after all three recaps complete (or after resetting all phones).

The closing slide triggers a local, full-page nine-second confetti celebration, replayed on re-entry and cancelled when leaving. It respects reduced-motion preferences. No existing Sites confetti asset was present in the repository; the presentation uses a self-contained equivalent.

### Sequenced dark-mode entrance and exit

Entrance: title fades out (450 ms), row rises at 600 ms, background starts darkening at 1450 ms, and backlight/video startup begins at 2450 ms. The sequence is cancellable with Back; navigation away cancels pending callbacks.

After the final recap starts, its 950 ms drop is allowed to land. Backlight fades, the row starts descending at 1350 ms, background returns to warm at 2250 ms, and the title starts fading back in at 3150 ms. Dark-mode backlight softness is 30 px. Neutral black letterboxing replaces the former blue background, avoiding light seams around the dark slide. The phone sequence stays dark between demos.

### Pax typography and Chrome reference

The repository contains Pax's captured brand/UI typography guides. This deck now loads local Pax Civil Regular, Medium and Bold, with Arial as the documented fallback. Headings use Bold; body copy uses Regular; interface labels use Medium. Existing slide copy, capitalization, colour choices, sizes and animations are retained. See [font sources](media/fonts/README.md).

Chrome's top and bottom strips use the user-supplied IMG_5453.PNG, at their original proportions: 328/2796 of the screen for the top and 233/2796 for the bottom. Its original status symbols, expanded island indicator, battery and toolbar icons are preserved. Only the live time and existing presentation address are overlaid. The simulated generic status row is hidden during browser playback to avoid duplicated symbols.

### iPhone 15 Pro Max frame

The presentation now uses a titanium-style iPhone 15 Pro Max SVG, with a 430 × 932 display (the supplied screenshot's 1290 × 2796 ratio) inside a separate black bezel. Screen bounds are x=18, y=16, width=430, height=932 in a 466 × 964 frame coordinate system. The screenshot fills this display, not the phone's outer frame; rounded screen clipping and bezel geometry share the same coordinates. Device proportions reference [Apple's iPhone 15 Pro Max specifications](https://support.apple.com/en-us/111828). The browser version leaves the Dynamic Island from the screenshot visible rather than drawing a second one.

All phone states now share the same immutable `iphone-15-pro-max.svg` chassis; there is no state-driven frame swap. The SVG viewBox includes 2 units of transparent safety padding on every side so titanium edges and side buttons cannot be clipped. The display remains 430 × 932 inside that chassis, and the lock/recap Dynamic Island is a separate display layer. The browser uses the island already present in the screenshot.

The camera lens is now a permanent layer fixed to its physical display position. A separate black island shell expands from the compact cutout to the screenshot's wider activity pill during browser startup. The lens rings and reflection remain visible throughout; the activity icon fades in beside it. A small matching patch covers the screenshot's baked island so there is only one animated island. The Pro Max chassis never changes.

### Live demo QR

The closing slide now encodes [the live Paxi demo](https://paxi.rushworks.workers.dev/) using the local SVG `media/qr-paxi-live.svg`. Temporary status and the replacement overlay are disabled. The animation, central placement and hidden written URL are retained.

### Latest presentation URL and Safari frame

Use `/presentation/` with optional `#1`, `#2` or `#3` for the slide. Legacy preview query parameters are stripped automatically; all links open this same latest deck. Internal asset cache versions are not presentation versions.

Phone browser chrome now uses the user-supplied IMG_5456.PNG Safari screenshot: the top status area and bottom Safari address controls, excluding the app's own navigation. The live clock is retained. The physical Pro Max camera island and lens remain visible in all phone states; Safari keeps the compact island because this reference has no expanded hotspot indicator.

Safari's page viewport is lowered by approximately 1.4% of the display height: top safe area 7.3%, bottom browser area 9.5%. The original controls stay anchored inside the Pro Max display, the full page area retains its height, and the camera island remains fixed.

## Frozen pitch and interactive backups

The three main pitch slides are frozen as of commit `4773ece`. Backup styles and interactions live in `backups.css` and `backups.js` and are scoped to the supporting slides.

- **A** opens B01: architecture and data exchange.
- **B** opens B02: implemented prototype features.
- From a backup, **Right / Page Down** moves to the next backup; **Left / Page Up** goes back.
- B03 covers deliberate boundaries and deferred production work; B04 covers known limitations.
- Click a moving word (or focus it and press Enter) for detail. Reduced-motion preferences stop the drift.
- **Escape / End** returns to the closing pitch slide. The main pitch still ends at slide 3.

Backup claims are based on `code/voice-agent/README.md`, its browser client, `code/README.md` and the source inventory in `FEATURES.md`. “Implemented” refers to the prototype capabilities, not a new end-to-end deployment certification. No backend code was changed or retested for this presentation-only addition.

Backup refinement: the closing slide has a “Backups →” button. B01 is a left-to-right SVG flowchart with distinct audio, transcript/context and results/orchestration colors. B02–B04 use draggable Pax Civil pills; click or Enter expands a lighter detail card. Drag positions last for the current page session. Architecture was rechecked against the current local voice README, case bridge integration and backend README. The recording placeholder topic has been removed.
