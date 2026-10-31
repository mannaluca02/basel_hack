# Offline voice integration and bounded evaluation

`VoicePipeline` is an opt-in, provider-neutral module exported by `index.ts`. It is not
registered as an HTTP route or connected to the microphone in the Angular app. Inject
the five `VoiceProviders` functions to connect real adapters later:

```text
audio → transcribe → mask(inbound) → dialog(VoiceLog)
      → mask(outbound) → synthesize(AgentReply) → play → terminal PlaybackEvent
```

## Test specification

The agreed public boundaries are `VoicePipeline.run()` and the executor/verifier API.
Only provider boundaries are substituted; runtime integration tests use the actual
case, extraction and customer-confirmation services with a temporary encrypted store.

| Requirement | Passing evidence |
| --- | --- |
| Complete audio-to-playback turn | Providers execute in order; masked, final `VoiceLog`, validated `AgentReply` and bound terminal `VoicePlaybackEvent` are returned. |
| Sensitive text boundary | Both text directions require `mask`; no dialog/TTS call follows masking failure. Returned data and pipeline errors omit original names/provider exception messages. |
| Input/output validation | Partial or blank transcripts, unsupported/empty/oversized audio, malformed replies and mismatched case/turn/correlation/locale fail before downstream calls. Financial replies retain shared grounding validation. |
| Playback correctness | No result before the player resolves; interruption returns `cancelled`, never `ended`. A real runtime question is presented only after `ended`; an STT “Ja.” cannot accept an unpresented question. Acceptance does not confirm the whole profile. |
| Cancellation and bounded latency | Abort at each asynchronous boundary discards late output. An uncooperative provider cannot start subsequent stages; a configurable whole-turn deadline rejects a hung provider without retries. |
| Isolation | Concurrent runs have separate opaque masking scopes and playback IDs. |
| Bounded evaluation | Stop on verified success; both functionality and code quality must pass. Feed each evaluation into the next executor call. Reject limits outside 1–5. Exhaustion returns final failure feedback and CLI exit status 1. Executor/verifier errors cannot become a pass. |
| Code quality | TypeScript build, browser client type compatibility and contract-export checks must pass. Missing, duplicate, signalled or timed-out check evidence fails verification. Review additionally checks module boundaries, failure handling and scope; automated checks do not score readability. |

The four-byte audio fixture is an opaque adapter payload, **not a decodable recording**.
Tests establish orchestration and runtime contract integration, not recognition accuracy,
pronunciation, audio decoding, browser autoplay/microphone permissions or live-provider latency.
Real STT/TTS adapters and a browser playback test are still needed for those claims.

## Running it

From `code/`, use the repository-supported Node **22–24**:

```sh
npm run test:voice
npm run evaluate:voice
npm run evaluate:voice -- --max-attempts=1
npm test
```

`test:voice` runs the new pipeline and executor tests plus existing customer-confirmation
tests. `evaluate:voice` executes build, client types, contract exports and these functional
tests, then prints independent `functional` and `codeQuality` verdicts. Each attempt
includes check exit status and bounded command output (last 16,000 characters per check).
Failure feedback names the check and the suggested next action. A failed build prevents
execution against stale compiled files. Each subprocess has a 120-second timeout; timeout
terminates its process group on POSIX (process tree via `taskkill` on Windows) and returns
failure evidence without waiting indefinitely for descendant output pipes to close.
Windows tree cleanup has an additional one-second deadline before a direct-process fallback.

The executor stops after at most five attempts (default five), or the first combined pass.
The CLI re-executes checks; it does not edit source code. Programmatic repair work can use
`executeEvaluation({execute, verify, maxAttempts, onFeedback})` in
`scripts/voice-evaluation.mjs`: `execute({attempt, previousFeedback})` performs work and
returns evidence; `verify(evidence)` returns `{functional, codeQuality}`, each with a
boolean `passed` and nonempty string-array `feedback`. `onFeedback` receives each result.
Repair callbacks must supply their own deadlines if they can block. Speech/provider calls
are never automatically retried by `VoicePipeline`.

## Planned Presidio middle layer

`mask({scopeId, direction, text, locale}, signal)` is a required text-only policy boundary.
It cannot replace message IDs, case bindings, revisions or financial source references.
Its `scopeId` is unique per `run()` and shared across that run's inbound and outbound calls,
so a Presidio adapter can maintain isolated entity mappings. No identity-mask default is
provided; the runtime tests explicitly choose passthrough only for authored synthetic data.

Next step: implement a Presidio service adapter behind this function, with entity/language
policy, per-scope cleanup/expiry, cancellation, service deadlines, fail-closed handling and
dedicated detection-quality tests. Decide separately whether local playback should remain
masked or use locally restored text. Raw audio reaches STT **before** text masking; this
hook is not audio anonymization and is not authorization to send personal data externally.
The current strict `synthetic` contract and existing transfer restrictions still apply.

The pipeline stores no audio, transcript or entity mapping and emits sanitized error codes:
`INVALID_INPUT`, `STT_FAILED`, `MASK_FAILED`, `DIALOG_FAILED`, `TTS_FAILED`,
`PLAYBACK_FAILED`, `ABORTED`, `TIMEOUT`. Providers must honor `AbortSignal` to stop their
own work; discarding late results cannot undo side effects a dialog adapter already committed.
An application adapter must retain existing authorization/revision checks and connect
handover/new-question cancellation to the signal. The pipeline itself never decides
customer acceptance or profile confirmation.
