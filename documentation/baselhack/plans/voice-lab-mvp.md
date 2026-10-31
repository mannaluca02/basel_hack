# Voice Lab MVP — guided live entry and spoken-income flow verified

## Current live-only implementation

The current UI uses live voice only; authored replay and amount-sample buttons have been removed.
Live start requires enabled model extraction, both consents and available prompt settings.
Assigned skills are loaded directly from `code/voice-agent/skills`; selections, time budget and
priority reach the provider prompt. Captured proposals and corrections update the readable canonical
view, and extraction failures never count as unanswered questions. See the
[Debugging App README](../../../code/apps/web/debugging-app/README.md) for the current workflow.
The sections below preserve the earlier implementation and verification history.

The debug UI now lives in its own Angular application under
**[`code/apps/web/debugging-app/`](../../../code/apps/web/debugging-app/README.md)**.
It is no longer a route in the normal web application. Its own server serves `/` and redirects
the previous `/voice-lab` URL to `/`. It reuses `CustomerApi`, `CustomerReview`, `ApiDataSource`,
`CaseStore`, the encrypted case runtime and proposal/confirmation workflows.

**Dario's `code/voice-agent/` has no working-tree changes.** Its last recorded commit is
`abc6ebf` (`docs(voice): add the Peter stress-test conversation as an example`); nothing was
reset or overwritten there. UI, voice transport, trace and component tests moved to
`code/apps/web/debugging-app/src/app/`. Its own launcher is
`code/apps/web/debugging-app/scripts/start-api.mjs`. Debug route/header/dock changes and the
trace interceptor were removed from the normal app shell.

Separation verified: **34/34 Debugging App tests + 183/183 normal web tests pass**; both
production builds and shared i18n/token checks pass. Browser replay reaches the real pending
backend proposal under the new `debugging-root`; Live Start is enabled after explicit consent.
The relocated backend launcher passes an isolated startup/status smoke. Existing API3030
sessions were preserved; only the dedicated UI4300 process was replaced with the new app.

Current running UI: **http://localhost:4300/voice-lab** (API 3030). The follow-up bugfix
loop completed successfully after **four rounds out of a maximum of five**. Both independent
reviewers passed round 4. Final verification: **217 frontend tests and 366 backend tests pass**,
plus a real GPT-Live two-customer-turn dialogue producing the corrected pending amount.

## Run

Use the installed Node **26.11.1** for Angular 22 (its supported versions are `^22.22.3 || ^24.15.0 || >=26`). The backend's package engine currently declares 22–24; its TypeScript build and tests also run on this installed Node 26 runtime. No new dependencies were added.

From the repository root, in two terminals:

```sh
PAX_SYNTHETIC_VOICE_ENABLED=1 npm --prefix code/apps/web/debugging-app run start:backend
```

```sh
npm --prefix code/apps/web/debugging-app start
```

Open **http://localhost:4300/**. Accept the existing synthetic-data notice. In the **Dialogue & avatar** panel, click **Prepare demo case**. This explicit action signs in with the editable, prefilled **public demo code** `voice-lab-demo-customer-only-2026` and loads the invented baseline only into an empty case. Existing signed-in cases are reused. This code works only with the dedicated launcher; the ordinary backend uses its own private local customer access code. Do not copy that private code into documentation or traces. Preparation opens neither the microphone nor a provider connection; live voice still requires its separate consent and an explicit Start click.

The dedicated launcher uses the normal Nest application with replay calculators and a new temporary encrypted case directory for each process. It requires no calculator key, microphone or voice key for synthetic replay. Existing cases in `code/.local/lifemap` are not used. Stop the launcher with Ctrl-C. Reloading the browser against a restarted temporary backend requires signing in again (expired sessions are cleared by the existing review service).

### Repeatable synthetic journey

1. Use **Prepare demo case** in the conversation panel. Gross income is CHF 120,000 for `person_demo_1`, CHF 80,000 for `person_demo_2`; **neither is confirmed**. The speaking-person selector appears only once actual matching financial/insurance person IDs are loaded.
2. Click **Replay dialogue: statement → correction**. This runs an authored conversation through real authenticated HTTP requests. It sends CHF 119,000, then CHF 118,000, then smalltalk. The first proposal is superseded; the second remains pending. Draft gross remains CHF 120,000. No microphone, audio playback, external voice request or LLM inference occurs. Avatar activity in this mode is explicitly simulated.
3. Inspect **Latest server extraction**, the request/response trace, canonical DTO, and presenter/store projection. `119000 CHF` maps to `11900000` canonical CHF cents. A correction changes the proposed value even though the number of fields stays equal.
4. In the existing **Review** panel below the trace, review and accept the pending package. Draft gross becomes CHF 118,000. Profile version remains absent.
5. Request the **separate profile confirmation**, inspect the profile, assumptions and notice, then explicitly confirm. Only this action creates profile version 1. Net budget income and additional savings remain unchanged.
6. Send another sample/correction to create a new pending proposal against the confirmed version. The UI displays the draft amount, last confirmed amount and pending proposal separately. Repeated turns never infer confirmation from speech or capture.
7. Request human advice: media stops locally before the handover request; the backend persists its stop signal. Explicit **Allow digital dialogue again** is needed before a new digital turn. Resume never restarts microphone automatically.

Individual amount/correction/no-match buttons also exercise the routes. The server only accepts the authored synthetic samples in synthetic mode. No-match results visibly contain `RULE_NOT_MATCHED` and `screen_or_human_review`; they are not counted as captured fields.

### Configured live connection

The launcher reads the root `.env` without displaying its values. The **presence-only** provider notice reports configuration, not provider health. Live mode needs:

```dotenv
PAX_SYNTHETIC_VOICE_ENABLED=1
OPENAI_API_KEY=
LIVE_MODEL=gpt-live-1
LIVE_VOICE=juni
```

Restart the backend after configuration. Select **Live · microphone**, explicitly consent to the displayed OpenAI processing notice, select the speaking person, and click **Start live conversation** on localhost/HTTPS. Audio goes to the configured GPT-Live service through WebRTC; keys stay server-side. The client adapts **Dario's current `oai-events` / `session.*_transcript.delta` protocol** to the canonical case session API. It uses **Lukas's actual `pax-avatar.js` renderer**, synchronised with the incoming audio stream and activity events. The build/start hook copies this renderer from its single source into generated, gitignored public assets.

Continuous user/agent fragments are accumulated and posted after 1.5 seconds of quiet with stable per-segment message IDs. This is explicitly **client-settled segmentation**, not a provider finality signal. Backend ingestion still requires `transcriptStatus: final`. Interrupted buffers are discarded. Neither this timer nor avatar amplitude is used as proof of completed playback or permission to confirm. All acceptance/profile confirmation in this MVP is screen-based.

The live conversation uses the existing backend GPT-Live gateway and its synthetic-intake prompt. The standalone prototype's unauthenticated conversation files, questionnaire answer store, automatic language switching, recorded intro and silence/goodbye policies are not used. Language changes stop media immediately; the existing customer-review service updates the case locale. The user starts a new session explicitly. ElevenLabs metadata is available from the existing backend, but this view supports GPT-Live only.

## Extraction boundary and honest trace

**`rules-v1` is not a model.** It recognises a closed grammar of explicit, exact annual gross CHF statements. All four languages retain the numeric paths; English and German additionally support bounded whole-number words, e.g.:

> Mein Bruttojahreseinkommen beträgt 119000 CHF.
>
> Correction: My annual gross income is 118000 CHF.
>
> My annual gross income is one hundred nineteen thousand Swiss francs
>
> Korrektur. Mein jährliches Bruttoeinkommen beträgt einhundertachtzehntausend Schweizer Franken.

Other fields, approximate amounts, ranges, ambiguous wording and implicit people are not inferred. The selected stable person ID is shown explicitly. Unsupported statements return a visible follow-up issue. Number-word recognition uses an exact place-value grammar, not a loose word sum or an extraction model. The amount quote remains a verbatim substring of the persisted raw customer transcript; only its structured CHF value is normalized. Full grammar limits and locale-specific digit conventions are recorded in follow-up round 4 below. The existing Erni Responses model adapter and its separate hash-bound transfer consent remain separate; this MVP does not claim to have called them.

Authenticated orchestration routes:

- `POST /api/cases/:caseId/voice-lab/initialize`: initialise an **empty** synthetic case with the authored unconfirmed baseline; revision-guarded. Cannot overwrite an existing draft.
- `POST /api/cases/:caseId/voice-lab/turns`: synthetic authored sample OR live **persisted customer message ID**. The browser cannot supply an agent actor, arbitrary observations, live transcript text or a confirmed value.
- Live turns first go to the existing `/voice/sessions/:id/turns` endpoint. The orchestrator reads that owned final customer source, obtains a short-lived server-only case agent grant, and uses `VoiceIntegrationService.propose`. Synthetic samples use `ExtractionWorkflow.proposeBatch`. The grant is revoked in `finally` and never returned to the browser or logged.
- Corrections supersede only complete pending packages whose paths are covered by the new changes. Accepted history remains intact. Replays return the current stored package and reject changed attribution.

The trace contains actual intercepted HTTP bodies/statuses with paired correlation IDs, actual GPT-Live data-channel JSON and SSE events, plus explicitly labelled **local** server-orchestration results and presenter/store projections. It does not invent outbound provider/model payloads or claim visibility into WebRTC audio packets. Start SDP, tokens, access codes, CSRF and sensitive-keyed nested values are redacted before retention. Headers are not retained. The trace is in memory only, bounded to 80 entries with a 16,000-character serialized preview plus explicit truncation markers, and cleared on leaving the view. Strings over 8,000 characters become a labelled preview with original/retained lengths. Arrays over 100 items include a labelled omission marker with original/retained lengths. Depth-limited subtrees and the final serialized clipping are explicitly marked too; a smaller payload is never silently presented as complete after these losses.

Canonical update path: **backend transaction → authenticated case DTO → `projectCase`/`caseProjection` presenter → existing `CaseStore` → Angular view**. SSE is a reload notification. Mutations, reconnects and manual refresh read the backend. Old canonical revisions cannot overwrite a newer store snapshot. Requests belonging to a superseded customer case are filtered out. No optimistic financial mutation or second writable case store is introduced.

Review commands explicitly refresh `CaseStore` in their `finally` path, including lost-response/unknown-outcome failures; an already-open or reconnecting EventSource is not treated as sufficient synchronization. `CaseStore.digitalStops` delivers handover and session-ended control signals synchronously, before pending financial snapshots or buffered context events. Components consume this store boundary; Voice Lab no longer subscribes to `AdvisorDataSource`. Store context notifications also supply the diagnostic SSE trace.

The live avatar opts into `{type: 'local-audio-visual', enabled: true}` after attaching the real output stream. Its existing analyser drives the `explaining` pose, speech-onset beats and eye emphasis. Local quiet returns it to `listening`; late output captions cannot pin it in `thinking`. Detach/Stop resets the local envelope and visual state synchronously. The UI and trace label this as a **local audio-energy heuristic**, never final-transcript, audibility, playback-end or confirmation evidence. Legacy renderer behaviour is preserved for callers that do not enable this mode.

## Approved seams and required checks

1. **Browser controls/avatar → voice lifecycle**: media permission races, Stop during signaling, immediate local cleanup, orphan-session closure, repeated transcript turns, provider-event deduplication, value-sensitive context updates, session expiry and failed remote cleanup. These tests do not assess STT accuracy or provider speech quality.
2. **Transcript/extraction → authenticated case API**: real Nest routes, cookie+CSRF, owner/case binding, persisted customer provenance, explicit person attribution, unsupported statements, replay/conflict, corrections and two distinct confirmations. These tests do not assess model quality (the extraction path is rules-only).
3. **Backend update → presenter/store/view projection**: pending proposals do not alter draft values; accepted values project through the existing store; delayed stale snapshots cannot roll values back. Existing Angular review tests cover screen presentation and separate acceptance/profile confirmation. Final independent browser evaluation belongs to the evaluator; no paid live call has been opened by the implementation agent.

```sh
# Full backend build, client types, contract export check and tests
npm --prefix code test

# Targeted canonical lab HTTP tests
npm --prefix code run build
node --test code/tests/voice-lab.test.mjs code/tests/voice-lab-income.test.mjs

# Angular behavioral tests, production build and design/i18n guards
npm --prefix code/apps/web test -- --watch=false
npm --prefix code/apps/web run build
npm --prefix code/apps/web run check:tokens
npm --prefix code/apps/web run check:i18n
```

Tests introduce no provider API calls. Test files include `code/tests/voice-lab.test.mjs`, `code/tests/voice-lab-income.test.mjs`, `voice-lab.spec.ts`, `paxi-case-voice.spec.ts`, `voice-lab-api.spec.ts`, and `canonical-projection.spec.ts`. These supplement the existing voice, handover, confirmations, review, API and case-store suites.

### Round 1 execution results (31 October 2026)

- Angular: **184/184 tests pass** across 17 files; production build passes without budget warnings; token and four-language i18n checks pass.
- Backend: TypeScript build, example client typecheck and all **38 shared schema export checks pass**. Full serial test run: **241/241 pass** (`node --test --test-concurrency=1 tests/*.test.mjs` from `code/`). Both new lab HTTP journeys pass.
- Default parallel `npm --prefix code test`: **240/241 pass**. The existing `voice-evaluation.test.mjs` process-tree timeout test sometimes kills its descendant before the heartbeat fixture has started (`ENOENT` / “the descendant actually ran”). That same test passes in isolation and in the full serial run. No unrelated timeout test or runner has been modified.
- Dedicated synthetic launcher startup and `/api/status` smoke: **pass**, with voice enablement and voice key explicitly absent. The smoke process was shut down; the evaluator starts the final UI/API sessions.
- No browser evaluation or paid live provider request was performed by the executor in this round.

### Round 2 fixes and regression evidence

Independent review rejected round 1 on four blockers; round 2 implements each through the approved seams:

1. **Actual audio-responsive avatar:** `voice-avatar.spec.ts` mounts the real shared renderer with a controlled level source and animation clock. Two equal-time instances receive different amplitudes; the test observes `explaining`, differing actual SVG eye geometry, silence returning to `listening`, and Stop clearing the envelope/pose with no playback ID. This failed before the new opt-in interface/bridge existed. Existing prototype adapter/renderer tests also remain green.
2. **Review → API → store synchronization without SSE:** `customer-review-store.spec.ts` uses the real `CustomerReview`, authenticated HTTP contract, `ApiDataSource`, presenter and `CaseStore`. Acceptance must update the canonical projection with an open stream, a reconnecting stream, and a lost response after server commit. No event notification or manual snapshot injection drives those assertions. All three initially failed at the stale CHF 120,000 amount and now reach CHF 119,000 with the target package accepted.
3. **Honest truncation:** new trace tests cover 8,001-character strings and 101-item arrays that fit below the final cap, plus serialized/depth clipping. They initially failed because content appeared complete; every lossy limit now includes explicit metadata and applicable original lengths, while credentials remain redacted.
4. **Store-owned immediate control:** the store regression test holds the initial snapshot unresolved and verifies synchronous Stop delivery on the same source-event stack, with no promise/render/snapshot result required. Voice Lab consumes `CaseStore.digitalStops` and `contextUpdates`, not the datasource. Session-ended cleanup additionally catches a synchronous authentication-loss failure when remote closure cannot even be requested; browser media still stops.

Validation commands for this round (no backend files changed, so no full backend rerun):

```sh
npm --prefix code/apps/web test -- --watch=false \
  '--include=src/app/features/voice-lab/*.spec.ts' \
  '--include=src/app/core/advisor/**/*.spec.ts' \
  '--include=src/app/features/review/*.spec.ts' \
  --include=src/app/app.spec.ts
node --test code/avatar-prototype/pax-avatar.test.mjs code/avatar-prototype/openai-realtime-adapter.test.mjs
npm --prefix code/apps/web run build
npm --prefix code/apps/web run check:tokens
npm --prefix code/apps/web run check:i18n
```

The running evaluator API/UI sessions and launch ports were not stopped or changed. Independent browser evaluation remains the parent's step.

Round 2 results (31 October 2026): **138/138 affected Angular tests pass across 12 files**,
**8/8 existing avatar/voice-adapter tests pass**, production build passes without warnings,
token and four-language i18n checks pass, and `git diff --check` passes. Each new regression
was first observed failing before its corresponding fix. No backend code or backend suite
was changed/re-run in this round.

## Follow-up bugfix loop — round 1 of a new maximum-five-round cycle

### Reproduced problem and requirements

The parent reproduced the screenshot in real Chrome: the live provider was configured, but a
freshly signed-in case was still empty. The speaking-person selector had no options and Start
and Replay stayed disabled. A separate baseline action far above the controls was the hidden
prerequisite. Loading it made two persons available and enabled Start after voice consent.
This was a setup/UX failure, not evidence that microphone or live transport was broken.

Required behaviour implemented in this follow-up:

- Keep actionable preparation in the same conversation panel for **both** live and synthetic
  mode. One explicit **Prepare demo case** action authenticates with the provided code when
  needed, reads the authoritative current case, and initializes only an empty draft.
- Preserve existing financial/insurance data, authored goals/review flags, confirmed profiles,
  proposals and business history. Populated cases are used directly. Partial existing cases
  receive a localized explanation and reload/review path, never an automatic replacement.
- Do not render an optionless person select. Derive the initial selection from actual matching
  case IDs, retain a still-valid selection, and validate it before live or synthetic execution.
- Show localized reasons adjacent to disabled Start/Replay controls: API configuration,
  authentication, loading/empty/partial case, valid person, operation in progress, voice consent,
  provider availability and human handover. Consent stays separate from preparation.
- Preparation must never request microphone permission or open a provider session. Denied
  microphone permission must show browser-site-settings instructions and allow explicit retry.
- Refresh/restarted-server recovery must return expired sessions to the same-panel sign-in flow.
  Failed initialization remains retryable; retry first reads current state before any write.
- Human handover blocks both live and replay until explicit resume. A local control latch holds
  the stop even before the canonical reload resolves; it does not become a second financial store.
- Continuous live delivery must retain one connection across at least two customer and two agent
  settled segments, preserving speaker roles, selected person, CSRF and source-message binding.

### New regression evidence

`voice-lab.spec.ts` mounts the actual Angular component, forms, `CustomerReview`, `CustomerApi`,
`ApiDataSource`, presenter and `CaseStore`. Only the HTTP server and browser media boundary are
controlled. The initial regression **failed on the actual rendered empty `<select>`**. The fixed
journey prepares the case, receives two options and enables Live with the already-checked consent,
then enables Replay without opening media. Additional tests cover fresh-tab one-step sign-in with
an explicitly supplied code, failed initialization/retry, existing profile/history and reversed
person order, goals-only partial state, expired session recovery, denied microphone retry, mock
configuration and handover/resume.

A second regression **failed because Start re-enabled while a handover-triggered canonical read
was pending**. The immediate control latch now keeps Start blocked and exposes Resume on that
same notification. A component-level live test delivers two customer and two agent segments
through one WebRTC connection into the authenticated turn routes; only the customer segments
invoke extraction, using the selected second person's ID and their persisted source IDs. It then
checks immediate microphone/peer cleanup and the real close request contract.

The initializer also had a direct-API preservation gap: goals-only and review-flag-only drafts
were accepted for baseline replacement. The new authenticated Nest regression initially returned
**201 instead of the required 409**. The backend now rejects all existing authored draft/business
content and checks the initial revision before loading the fixture; the canonical patch rechecks
the revision on commit. The HTTP test verifies no draft, profile or revision change on refusal.

Validation for this follow-up:

```sh
npm --prefix code/apps/web test -- --watch=false \
  '--include=src/app/features/voice-lab/*.spec.ts' \
  '--include=src/app/core/advisor/**/*.spec.ts' \
  '--include=src/app/features/review/*.spec.ts' \
  --include=src/app/app.spec.ts
npm --prefix code/apps/web run build
npm --prefix code/apps/web run check:tokens
npm --prefix code/apps/web run check:i18n
npm --prefix code run build
node --test code/tests/voice-lab.test.mjs
```

The parent manages the real browser/provider speech evaluation in this loop. The executor tests
use no live model/audio API calls and make no speech-recognition quality claim. Running API3030,
UI4300 and existing user sessions/ports are not stopped or reconfigured. The frontend setup fix
works with the running API; the tightened **server-side** empty-case guard needs a parent-managed
API restart to load the newly built backend module. The parent already confirmed a real live
connection, persisted agent greeting and successful close before this follow-up; spoken-income
evaluation is a separate new evidence step, not claimed by these component tests.

Follow-up round 1 execution results (31 October 2026): **149/149 affected Angular tests pass
across 13 files**, including **11 real-component setup/lifecycle journeys**. The production web
build passes without budget warnings; token checks and all four translation catalogs pass
(141 keys, no unused-key warning). Backend TypeScript build and **3/3 targeted Voice Lab HTTP
tests pass**, including the new authored-draft preservation regression. `git diff --check` passes.
No live provider call was made by the executor and no running application process was stopped.

## Follow-up bugfix loop — round 2: revision- and session-bound handover control

Both independent evaluators reproduced a control race in the round-1 latch:

1. Hold a digital/revision-0 Reload case response, receive Stop/revision-1 over SSE, then release
   the old read while subsequent canonical requests remain pending. The old response cleared
   the latch and enabled Start/Replay again.
2. Hold a Resume/revision-2 acknowledgment, receive a newer Stop/revision-3, then release the old
   command acknowledgment. The unconditional clear lost the newer Stop.

Both rendered regressions were observed failing before the round-2 fix (Start was enabled when
it had to stay disabled). They now leave Start and Replay disabled, Resume visible, and the
microphone untouched. A bound, successful Resume/revision-4 response is then allowed to release
Stop/revision-3, even if the financial case reload has not yet completed.

### Control authority and lifecycle

`HandoverControl` replaces the nullable latch. It contains only control evidence, never financial
case data. Its invariants are:

- Control revisions are monotonic within the current authenticated customer-session object and
  case ID. Creating another HTTP request does not reset that revision history.
- Older evidence cannot unlock **or re-stop** a newer state. For contradictory flags at the same
  handover revision, Stop wins. Recent nonstopped HTTP/SSE state may release an older observed
  Stop; an equal/older nonstopped state cannot.
- Resume acknowledgment must match the current session, case, command message ID and action.
  Its handover state is merged by revision instead of blindly clearing a flag. A malformed reply
  or delayed acknowledgment of an earlier Stop is not authority to restart.
- Canonical case handover state and immediate store notifications use the same ordering rule.
  An older canonical Stop cannot override an acknowledged newer resume while its reload is
  pending. A local handover-request intent remains blocked against same-revision ordinary reads.
- Reads and commands capture their customer-session scope before awaiting HTTP. Replies/errors
  from a superseded case/session are discarded; an old 401/404 cannot clear the replacement session.
  Session synchronization is idempotent so a delayed effect cannot erase a newer Stop already
  received in the new session, including reauthentication with the same case ID.
- `ApiDataSource` binds snapshots and every stream callback to its captured session and stream.
  `CustomerReview` also discards old-session reload successes and failures. A stale closed-stream
  error cannot disconnect the replacement stream.

### Round-2 regression coverage

The real-component suite now additionally covers:

- Held HTTP digital responses at revisions 0 **and 1** versus Stop/1, with later case GETs pending.
- Held Resume/2 acknowledgment versus Stop/3, followed by a valid matching Resume/4.
- An adequately recent digital/2 HTTP read, stale Stop/1 replay, and foreign-case Stop/100.
- Reauthentication to the same and a different case, delayed old reads (success and expired 401),
  and late old-stream terminal errors. These four tests also exposed an old EventSource error
  closing the replacement stream; all four failed on that condition before the stream-scope fix.
- Higher-revision Resume/6 replies from an expired session versus Stop/1 in the replacement
  session, for both same-case-ID and different-case-ID authentication.

These tests use the rendered controls, real customer API/review/store path and controlled HTTP/SSE
delivery. They verify that blocked controls cannot invoke microphone access. The existing setup,
permission-denial, continuous two-customer/two-agent-turn and media cleanup journeys remain in
the affected suite. No backend code is changed in this round, so the backend suite is not rerun.
The parent continues independent real-provider/browser evaluation and manages its own API restart;
the executor does not stop application sessions or change launch ports.

Round-2 session-boundary coverage also verifies `ApiDataSource.connect()` replacing an old stream
after authentication changes without requiring a separate disconnect, including the same case ID.
This public adapter regression initially failed because the old stream was retained. It now proves
old snapshots, notifications, open callbacks and terminal failures cannot affect the replacement.

Follow-up round 2 results (31 October 2026): **160/160 affected Angular tests pass across 13 files**,
including **21 rendered Voice Lab component journeys**. Production build passes without warnings;
token checks, all four i18n catalogs (141 keys), and `git diff --check` pass. Both reported P2 races
were observed failing before their fixes, as were the old-stream/session-boundary regressions.
No backend code or suite changed in this round. No live provider request or application process
restart was performed by the executor.

## Follow-up bugfix loop — round 3: unknown request intent is not ordinary case state

Quality evaluation found one remaining P2 after the round-2 functional pass. The displayed case
was digital/0, while a prerequisite read returned digital/2 from another tab's stop/resume. That
higher revision consumed `requestPending`. If the following Request Human command committed
Stop/3 but its response was lost, an old canonical case and withheld reconciliation could enable
Start/Replay again.

The round-3 production change is deliberately bounded to the existing control logic:

- `observe()` preserves local request intent across **all ordinary HTTP/SSE evidence**, regardless
  of higher revisions or whether the observed backend state is stopped or digital.
- `current()` also preserves it when merging canonical state, including equal-revision Stop and
  higher-revision snapshots. Canonical synchronization cannot silently discharge intent.
- Only an accepted **command-bound acknowledgment** or session termination releases intent.
  `acceptHandoverCommand` already verifies session, case, message ID and action; it now marks both
  successful Request and Resume acknowledgments as command evidence. A successful Request ACK
  discharges the local unknown outcome, but its authoritative Stop continues to block dialogue.
- Revision ordering and session/case checks still apply first. A stale command response does not
  gain authority to clear intent merely because it is an acknowledgment.

### Rendered regression and recovery

The new regression starts at digital/0, clicks **Request human advisor**, returns digital/2 for its
prerequisite GET, then loses the POST response after a possible Stop/3 commit. It holds subsequent
reconciliation. Before the fix this failed because Resume disappeared. After the fix it verifies
Start and Replay remain disabled, Resume remains enabled, and no microphone request occurs.

It then separately exercises the canonical merge (`current`) with digital/4 and the notification
merge (`observe`) with digital/6. Neither may resolve this command's unknown outcome. Both variants
also observe authoritative Stop/7; one proceeds directly to a matching explicit Resume/8, while
the other first receives an unrelated digital/8 update and still requires its own successful
explicit Resume acknowledgment (a legitimate no-op at revision 8). Only then are controls enabled;
Resume never starts the microphone automatically.

A positive regression verifies the normal acknowledged path: matching Request/Stop-3 acknowledgment
resolves local intent while retaining Stop, and later authoritative digital/4 state can release the
now-known outcome. This prevents a safety fix from leaving successfully acknowledged requests
permanently stuck.

The original rendered regression was observed failing before the fix. The new focused regressions
then passed **3/3**. No backend code, API route, layout or launch configuration was changed in this
round. No process restart, live provider call or agent delegation was performed by the executor.

Follow-up round 3 validation results (31 October 2026): **34/34 focused Voice Lab tests pass across
4 files**, including **24 rendered component journeys** and all earlier revision/session race
regressions. Production build passes without warnings; token checks, all four i18n catalogs
(141 keys), and `git diff --check` pass. Backend code and suites are unchanged in this round.

## Follow-up bugfix loop — round 4: observed speech must reach pending state

### Actual-provider finding and initial regression

The parent successfully exercised the real provider: two customer and two agent turns were heard
and persisted, but extraction returned `observations: []` / `RULE_NOT_MATCHED`. The actual customer
transcripts were:

> My annual gross income is one hundred nineteen thousand Swiss francs
>
> Correction. My annual gross income is one hundred eighteen thousand Swiss francs

The exact-digit-only matcher did not recognize spoken number words or `Correction.`. This was an
extraction-routing gap after successful voice ingestion, not a production microphone failure.
The parent's authored test speech used a test-only AudioContext/MediaStream injection because
Chrome's native fake-file microphone produced zero samples. No production microphone substitution
is introduced by this fix.

The first new authenticated HTTP regression persisted those exact customer/agent turns and then
called the live extraction route. It **failed on the old code because the proposal was null**.
The German equivalents also failed before adding their grammar. Both now produce sourced pending
proposals through the normal `VoiceIntegrationService.propose` path.

### Closed exact-income grammar

The controller delegates parsing to `code/apps/api/src/voice/exact-income.ts`, which returns only
an exact CHF decimal string and the **original amount substring**. It does not accept or infer a
person, case actor, field path, confirmation, model output or arbitrary observation from the browser.
The whole statement must match one of these explicit frames, case-insensitively:

| Language of the explicit statement | Frame | Currency spellings |
|---|---|---|
| EN | `My annual gross income is …` | `CHF`, `Swiss francs` (singular also accepted) |
| DE | `Mein Bruttojahreseinkommen beträgt/ist …`, `Mein jährliches Bruttoeinkommen beträgt/ist …` | `CHF`, `Schweizer Franken`, `Franken` |
| FR | `Mon revenu annuel brut est de …` | `CHF` |
| IT | `Il mio reddito annuo lordo è …` | `CHF` |

An optional `Korrektur`, `Correction` or `Correzione` prefix followed by **colon or period** is
supported, preserving the legacy correction prefixes. A trailing sentence period is optional.
Language-specific numeric conventions follow the explicit statement frame, not the UI/session
locale: an English answer in a German-selected session still has English syntax.

- **Number words (EN/DE only): whole CHF 0–999,999.** A triad is followed by at most one thousand
  scale and another triad. Each triad has a fixed scale order; repeated tokens in the same position
  cannot be freely summed (separate triads may legitimately reuse number words). English supports
  normal tens/unit spaces or hyphens, optional `and` after hundreds, and a thousand-bridging `and`
  only before a remainder below 100. German supports normal compound units/tens, `ss`/`ß` in thirty,
  optional `ein` before hundred/thousand, and spaces only at the hundred/thousand boundaries.
  Arbitrary character fragments such as `neun zehn` are never concatenated into `neunzehn`.
- **Digits:** plain digits and consistently grouped Swiss `'`/`’` thousands are supported in all
  four frames. English additionally accepts comma thousands (`119,000`). A period is decimal-only,
  with one or two fractional digits. Decimal commas, period thousands (`119.000`), mixed/malformed
  groups, leading zeros and mixed digit/word quantities such as `119 thousand` require review.
  Numeric values preserve the existing portfolio maximum of CHF 10 billion; the smaller word
  bound does not remove valid existing FR/IT numeric routes such as `1000000 CHF`.
- No word decimals, million/billion words, approximate amounts, bounds, ranges, negatives, monthly
  annualization, net-to-gross conversion, bare/context-dependent amounts, implicit person references,
  multiple statements or arbitrary sentence qualifiers are inferred. These return the existing
  explicit `RULE_NOT_MATCHED` / `screen_or_human_review` issue, without creating an observation.

The parser does not change stored transcripts. For the observed first turn the request contains
`quote: "one hundred nineteen thousand"`, `value: "119000"`, the persisted customer message ID,
and explicit year/gross/CHF metadata. Portfolio mapping produces `11900000` cents. The correction
quotes `one hundred eighteen thousand` and proposes `11800000` cents, superseding the first pending
package. Draft gross remains `12000000`; net budget, additional savings and profile confirmation
are untouched. Agent turns cannot supply customer facts even if their text exactly matches.

### Round-4 tests and deployment boundary

`voice-lab-income.test.mjs` exercises the **real authenticated Nest HTTP boundary** for login,
case creation/preparation, voice start, persisted finalized customer/agent turns, extraction and
canonical reads. Its literal positive/negative tables cover the observed English correction,
German word forms/currency phrases, exact decimal cents, consistent separators, FR/IT numeric
compatibility, source quotes, supersession and rejected approximate/range/repeated/malformed
utterances. Rejections preserve the draft, confirmed versions, proposal list and case revision.

The existing rendered component live-flow test now emits the exact four parent-observed transcript
strings. It verifies raw text and source message IDs reach authenticated ingestion/extraction with
the explicitly selected person; the client does not invent a digit transcript or extract agent
speech. That component test uses controlled browser/HTTP boundaries, not a paid provider call.

The executor builds the backend but does not restart API3030 or stop UI4300. The parent must load
the rebuilt backend in its managed restart before repeating the real-provider speech evaluation.
No extraction LLM, extra external transfer, new consent bypass or automatic financial acceptance
is introduced. UI limitations/examples are updated in DE/EN/FR/IT to state the supported word
grammar honestly; unsupported wording still requires screen/human review.

Round-4 execution results (31 October 2026): **165/165 targeted backend tests pass** across the
new income HTTP suite, existing Voice Lab HTTP suite, voice integration and customer-confirmation
suites. The new income suite contributes **124 tests including named table subtests**. The original
observed-English regression and initial German word regressions were each observed failing before
their parser support was implemented. **34/34 focused frontend tests pass**, including the component
sequence containing the four exact parent-observed transcripts. Backend TypeScript build, production
web build (no budget warnings), token checks, all four i18n catalogs (141 keys), and
`git diff --check` pass. These executor tests use controlled provider/browser boundaries and do not
claim a fresh paid live-provider run after the parser change; that remains the parent's restart/replay
step. No application process was stopped or restarted by the executor.

### Initial MVP evaluation and browser evidence (before the follow-up)

The executor/evaluator loop stopped successfully after **two rounds**, below the requested
maximum of five. Separate functional and code-quality reviewers both passed round 2.
The functional reviewer independently ran 26 affected Angular tests and eight existing
avatar/adapter tests, all passing.

Final parent verification on 31 October 2026:

- Full Angular suite: **192/192 tests across 19 files pass**.
- Real Chrome UI journey: sign in → initialize → replay income/correction/smalltalk →
  review pending CHF 118,000 → accept → separately confirm complete profile. Canonical
  draft and presenter/store view show CHF 118,000, profile version 1 and `draftDirty:false`;
  unchanged annual net remains CHF 84,000. No unexpected UI alerts occurred.
- Desktop screenshot and 390-pixel mobile viewport checked; no horizontal overflow.
- Real GPT-Live startup using Chrome's **synthetic microphone device**: session creation
  returned 201, WebRTC connected, Paxi's generated opening question appeared in the
  dialogue, and its agent transcript was persisted through the case voice route (201).
  Stop returned the UI to idle and the session-close route returned 201. Browser console
  contained no errors. This checks actual provider connectivity and transport, not human
  microphone permissions, spoken-income recognition or pronunciation quality.
- `git diff --check` passes.

The UI is left running at **http://localhost:4300/voice-lab**, with its dedicated API on
`127.0.0.1:3030`. Ports 4200/3000 were already occupied. This session uses a temporary
development proxy configuration (outside the repository) targeting 3030 and forwarding the
backend's existing permitted local Origin. The demo API was started with
`PAX_SYNTHETIC_VOICE_ENABLED=1 PORT=3030`; this is a process-only override, not a change to
the root `.env`. The configured key stays server-side. The standard restart commands above
use 4200/3000; set the enable flag explicitly when restarting for live voice.

### Final follow-up verification — real spoken dialogue through the canonical case

The new bugfix loop ended successfully in **round 4/5**. Functional and code-quality
evaluators independently passed the guided setup, monotonic/session-bound handover controls
and exact spoken-income parser. No fifth repair round was needed.

The parent restarted only the dedicated API3030 with voice enabled, then verified:

1. A fresh Chrome tab no longer renders an optionless person selector. **Prepare demo case**
   authenticates and initializes the empty case from the controls panel. Both person IDs appear.
   Live Start remains disabled with an adjacent consent explanation, then enables after consent.
2. A **real GPT-Live WebRTC session** received an authored spoken recording through a test-only
   browser `getUserMedia` replacement returning an AudioContext-backed MediaStream. The normal
   peer, provider, transcript routes, extraction and canonical store were used. No transcript
   strings or fake provider responses were injected. Chrome's file-backed fake microphone was
   tested separately and yielded silence in this environment, so it was not used as speech evidence.
3. The provider transcribed **“My annual gross income is 119,000 Swiss francs”**, then
   **“Correction. My annual gross income is 118,000 Swiss francs”**, and generated replies to both
   on the same connection. The preceding trial emitted the amounts as number words; both forms
   are covered by the new grammar and authenticated regressions.
4. The actual extraction response contained `value:"118000"`, original `quote:"118,000"`, the
   persisted customer source ID and `supersedesBatchIds`. The canonical view showed one pending
   proposal at **11,800,000 cents**; draft gross stayed **CHF 120,000**, with no confirmed profile.
5. After Stop, authenticated transcript GET returned all **five persisted turns** (three agent,
   two customer). Session status was `closed`, `remoteStop:requested`; browser console had no errors.

Final automated verification on 31 October 2026:

- **217/217 Angular tests**, across 20 files, including 24 rendered Voice Lab component journeys.
- **366/366 backend tests/subtests**, full serial run to avoid the documented parallel timeout
  fixture race; TypeScript build, browser-client types and all 38 schema exports pass.
- Production frontend build, design-token checks, all four translation catalogs and diff check pass.

Only the synthetic audio acquisition was substituted in the actual-provider trial. Human device
selection, OS/browser microphone permission and the user's acoustic environment still require
their own browser trial. The production microphone implementation was not replaced or modified
by the test harness. The fixture server is stopped after verification; the UI/API remain running.

## Evaluation focus / known limits

- Synthetic replay is a repeatable authored backend integration demo, not synthetic audio or a substitute for a paid microphone smoke test.
- Without the separate model-extraction consent, live extraction covers one exact annual-gross field (`rules-v1`) and requires explicit wording/person attribution. With that consent, `model-v1` covers the eight-field intake described in the Debugging App README. Unsupported fields remain visible follow-up issues.
- Live segmentation may split a long pause into separate turns. It must not be used for voice confirmations. Provider playback-end events are not fabricated.
- Configuration presence does not guarantee account access to the configured model. Provider rejection is visible in the trace; no retry silently switches services.
- Human microphone permissions and acoustic recognition on the user's own device still need
  a manual trial. Real-provider recognition of authored spoken income and its correction has
  the follow-up browser evidence above. Audio-driven renderer behavior and route/Stop cleanup
  have automated regression coverage.
