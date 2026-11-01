# Pax Digital Advisor – web

Angular 22 mobile-first web app (PWA). Standalone components, signals, strict TypeScript, SCSS.

Requires Node `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22 engines); the repo `.nvmrc` pins 24 (as CI and `code/package.json` engines).

Live voice runs in the app itself; the Voice Lab is a debug configuration of it, see
[Live voice and Voice Lab](../../../documentation/baselhack/plans/voice-lab-debugging.md).

```bash
npm ci
npm start          # dev server on http://localhost:4200
npm test           # unit tests (Vitest), add -- --watch=false for a single run
npm run build      # production build incl. service worker -> dist/web
npm run check:tokens  # no colour literals outside tokens.css, WCAG AA text contrast in both themes
npm run check:i18n    # missing/empty/extra keys per language, unknown keys used in src/app
npm run start:api     # dev server against the real case service, /api proxied to port 3000
npm run start:demo    # same, but opens on a ready synthetic case: no sign-in, no review stand
npm run start:debug   # demo start plus the Voice Lab tab (live voice trace)
npm run start:paxi    # demo start with Dario's Paxi in its own window instead of the live voice (code: npm run dev:paxi)
npm run start:live    # end to end without test data: a new empty case per start, the voice sets it up (code: npm run dev:live)
npm run start:debug:lab  # Voice Lab against the isolated lab backend (code: npm run start:voice-lab), port 4300
```

It is an npm workspace of `code/` (one lockfile there). The types of `@pax/contracts` come from its build, so run `npm ci && npm run build` in `code/` first.

## Structure

- `src/app/features/workspace/{graphics,risks,chat,info}` – one lazy-loaded route per tab
- `src/app/app.{ts,html,scss}` – app shell: header, Dynamic View (the only scroll container), icon-only tab rail on the right (the name shows as a tooltip on hover and keyboard focus and stays the accessible name) with the agent dock slot at its bottom. Tab routes carry `data: { keepAlive: true }`; `core/layout/keep-alive-route-reuse-strategy.ts` keeps their components alive across tab switches and the shell restores each tab's scroll offset. The global `:focus-visible` ring in `styles.scss` uses `box-shadow`, so do not override it on focus
- `src/styles/tokens.css` – Pax colours, radius and stroke; the theme follows the OS (`prefers-color-scheme`), there is no manual toggle. Components use only the semantic tokens (`--bg-*`, `--text-*`, `--icon-*`, `--border-*`, `--chart-1..8`)
- `src/app/core/theme/color-scheme.ts` – `ColorScheme.scheme` signal and `token()` for canvas charts that cannot read `var()`
- `src/i18n/{de,fr,it,en}.json` – UI texts; German is the source language, add every key there first. Missing keys fall back to German at runtime
- `src/app/core/i18n/` – runtime i18n with [Transloco](https://jsverse.gitbook.io/transloco/) (switches without reload; `@angular/localize` would need one build per locale):
  - templates: `{{ 'nav.risks' | transloco }}`; code/charts: `translateSignal('nav.risks')` or `TranslocoService.selectTranslate()`. Write keys out in full so `check:i18n` sees them
  - `AppLanguage` – `language()` / `locale()` signals and `use(lang)`. Initial language from `localStorage['pax.language']`, then `navigator.languages`, then German
  - `LocaleFormat` and the `chf` pipe – `Intl` formatting for `de-CH`, `fr-CH`, `it-CH`, `en-CH`; re-format on a language switch (also inside `computed`, e.g. chart axes)
  - `localeInterceptor` – sends `Accept-Language: <locale>` to `apiBaseUrl` so backend texts come back in the UI language
  - route `title`s are translation keys; specs use `provideI18nTesting()`
- `src/app/core/config/app-environment.ts` – `APP_ENVIRONMENT` token; inject it instead of importing `environment`
- `src/environments/` – `apiBaseUrl` and `dataSource` (`mock` | `api`); the development build swaps in `environment.development.ts`
- `src/app/core/advisor/` – the only seam to the advisor backend:
  - `contracts.ts` mirrors the interface contracts I04, I05, I08, I09, I10; `ui-models.ts` holds the UI types without a contract yet (`RiskItem`, `TranscriptEntry`, `InfoItem`, `ChartResult`, agent state)
  - inject `AdvisorDataSource`: `events` (live upserts), `snapshot()`, `connection`, `connect()` / `disconnect()`. `dataSource: 'mock'` binds `MockDataSource`, which replays a ~3 min synthetic call (`mock/mock-call-script.ts`, DE/EN texts, FR/IT fall back to DE). All amounts are in Rappen and come from the source; the UI never calculates them
  - components read `CaseStore` (`store/case-store.ts`), not the data source: one signal per slice (`charts`, `risks`, `transcript`, `info`, `progress`, `summary`, `agent`, `connection`, …) and `unread()` per tab, reset with `markRead(tab)`. It loads a snapshot on every (re)connect and applies live events on top. The version guard in `store/case-state.ts` drops a late result whose `profileVersion`, `runId`, `scenarioVersionId`, chart `revision` or `contextRevision` is older than the one held for the same item; a known `chartId` updates in place
- `src/app/core/advisor/api/` and `src/app/features/review/` – the real backend (`dataSource: 'api'`, `npm run start:api`). Backend data uses the types of `@pax/contracts`, only as `import type`, so there is no second contract and nothing extra in the bundle:
  - `CustomerApi` holds the customer session and the case routes. The session is the backend's HttpOnly cookie; the tab keeps only the CSRF token and the case ID, because every sign-in is a new owner with a new case
  - `ApiDataSource` implements `AdvisorDataSource` over the SSE stream. The only live event says "the case changed"
  - `CustomerReview` reloads the central state after every event, reconnect and mutation. It is also the seam for Dario's voice client, which never holds customer credentials: `open(target, { questionTurnId, questionReplyId })`, `playbackEnded(playbackId)` on the real TTS `ended` only, `answerVoice(voiceLog)` and `cancel('new_question')` before any other question, which resolves to `false` when the question is still open and the conversation must not move on
  - `ReviewPanel` is the review stand above the tabs. It reports a question as presented only from the rendered elements. Accepting a package and confirming the complete profile are two separate questions, and a transport failure is never retried: the reload shows what happened
  - To try it: `npm run dev:demo` in `code/` starts the backend with the demo start and the app
- The notice (`features/consent`) must keep matching `privacy.*` in the backend's `messages.ts`. `CONSENT_NOTICE_VERSION` is `PRIVACY_NOTICE.version`: raise both when the notice changes in substance, the backend then refuses a client showing the older text
- `public/` – manifest and icons rendered from `assets/pax/logos/online/colour-positive`

Environment files ship in the public bundle. Never put the Logismata token or any other secret in them.

The service worker only registers in production builds (`ng build` + a static server), not under `ng serve`.

## Demo start

`npm run dev:demo` in `code/` starts the case backend with `PAX_DEMO_START=1` (live calculator) and this app with `--configuration demo`. On start the app calls `POST /api/demo/start`; the backend signs in a customer itself, loads the Mueller persona, confirms it and calculates the standard scenarios. All visitors share that case while its session lasts, so reloads do not create new cases. The UI is the normal workspace, without sign-in and review stand. `npm run dev:debug` does the same in the debug configuration.

## Contract journey, documents, NPS

The rail's **Contract** tab (`features/journey`, against the backend only) continues after the advice: recommendation with reasons per product and person → Pax review → quote (no invented premium, product documents to download and acknowledge) → application (the four steps a real contract needs are named, not skipped) → submission → Pax review → demo policy in the customer portal, plus the advice dossier in a dialog (`/dossier`, print HTML). Fund-linked products ask for the suitability pre-check of the Pax form first (`suitability-form.ts`). In the demo start the Pax specialist's steps are simulated by the backend (`POST demo-review`) and labelled as such; elsewhere the case waits for a real reviewer. In the debug configurations (`start:debug`) the rail also links `/insights`: the aggregate funnel, possible drop-offs, NPS and handover requests for product management (demo start, `GET /api/demo/insights`). The agent dock shows Lukas's avatar renderer (`features/paxi/paxi-avatar.ts`), moved by the ring's activity and the live voice's level.

## Live voice

With `PAX_SYNTHETIC_VOICE_ENABLED=1` and `OPENAI_API_KEY` in the root `.env`, the backend offers GPT-Live and the model extraction, and a microphone button appears in the tab rail above the avatar. It asks for both consents (voice transfer, AI extraction), then `core/voice/live-voice.ts` talks over the case backend: `voice/sessions` (WebRTC), every settled turn to `voice/sessions/:id/turns`, every customer turn to `voice-lab/turns` (model-v1). Proposals arrive as packages, the avatar ring shows the activity (`core/voice/voice-activity.ts`) and the Chat tab the transcript. The control loads in its own chunk after the workspace. Paxi's reply emotions come from GPT-Live Decisions triggers that the backend sets on the session (`decision.event` on the data channel). The call's voice splits into reply segments by energy (`followAvatarVoice`, as in Lukas's adapter; a visual heuristic, never playback evidence): while Paxi speaks the face shows the reply emotion, in between listening and thinking. A human handover, a new session or a language change ends the call. The demo start has no review stand: a card next to the rail offers to accept what Paxi heard (`POST demo-accept`), which confirms the profile and recalculates the scenarios.

The live build (`start:live`) has no card and no button: the consent banner gives both consents and starts the call. The first sentences set up the person (age and employment rate, `apps/api/src/voice/lab-setup.ts`), then Paxi asks the eight intake fields, then everything the profile still needs before it can be confirmed: the domain's mandatory fields plus the budget and capital inputs, in conversation order (`GET voice-lab/questions`, `apps/api/src/voice/lab-questions.ts`). Each customer turn reads the answers to those open questions alongside the intake fields; every proposal is accepted at once, so once nothing is open `demo-accept` confirms the profile and calculates the charts. The questions whose answer settles others come first (relationship and partner, children, pension fund, debts, private insurance: each "no" fills its follow-ups by itself), a person's four pension fund risk benefits are one question, and after every question and answer the case is checked and the charts reloaded (`demo-accept` also retries a calculation that failed). Nothing is assumed: a question stays open until the customer answered it; one left unanswered goes to the back of the queue and comes round again, and Paxi is done only when nothing is open. Every open field is read each turn (the intake fields too, should the intake extraction miss one), and answered fields can be corrected in the latest sentence. Only plain consequences are written along: no pension fund means no pension fund benefits, no debts means nothing to repay and a zero debt line, known debt payments make up the debt line, and a single person gets the valuation year as partnership year (the calculator needs a number).

