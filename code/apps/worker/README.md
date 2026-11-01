# Worker live boot and assets (task C)

The Worker now uses the shared `liveAppOptions(env)` mapping, real `LiveLogismataProvider`, backend live voice and OpenAI extraction. Task B still owns persistence, credentials and alarms; this branch retains the spike memory store until that work is merged. No standalone voice-agent server runs.

Wrangler's custom build runs the API compiler and `scripts/assets.mjs`. That script uses the existing `loadSkills` / `parseSkill` / `skillsPrompt` implementation and assigned flags to generate prompt JSON. It copies all 12 product PDFs into gitignored `assets/_products/` and generates a SHA-256 manifest. Runtime reads through `ASSETS` and checks integrity at boot and every download. Only this subtree is written, leaving `assets/` available for Angular output. Keep the Angular build from clearing it after this step.

`run_worker_first: true` prevents direct public PDF asset access: the Worker currently returns 404 for non-API paths. When Angular routing is added, keep `/_products/*` blocked before falling back to `ASSETS.fetch()`. The PDFs themselves are public source material, but API downloads require a session. Do not expose the complete assets binding indiscriminately.

Persona JSON is bundled and passed through the same `normalizePersonaDraft` function as Node, including schema, synthetic classification and date checks. Runtime prompt loading is injected; the Node fs/default loaders remain unchanged. ReplayProvider and demo fixture file readers are not called in live mode. `erni-dialog/responses.ts` takes its API key as an argument. Only the Node entrypoint reads `process.env`; the Worker uses bindings. Nest shutdown hooks are disabled on Workers.

Worker HTTP writes accept their own origin (or `PAX_PUBLIC_ORIGIN` when set); CORS is unnecessary for this same-origin deployment. The bridge overwrites forwarded protocol/host from the actual request URL. HTTPS session and logout cookies include Secure. Node localhost CORS and CSRF defaults remain intact.

Non-secret vars in wrangler.jsonc: `PAX_DEMO_START=1`, `PAX_SYNTHETIC_VOICE_ENABLED=1`, `PAX_SYNTHETIC_EXTRACTION_ENABLED=1`, `LIVE_MODEL=gpt-live-1`, `LIVE_VOICE=juni`, `PAX_PUBLIC_ORIGIN` (empty means request origin). Secrets: `LOGISMATA_BEARER_TOKEN`, `OPENAI_API_KEY`; optional `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`. Copy `.dev.vars.example` to ignored `.dev.vars` and replace/remove placeholders. Missing calculator credentials fail calculations, not boot; missing OpenAI key disables its voice gateway. No secrets are loaded from `.env` automatically.

Verification from `code/`:

```sh
npm ci --ignore-scripts
npm run build -w @pax/worker
npm run typecheck -w @pax/worker
node apps/worker/scripts/sources-check.mjs
npm test
npm run dev -w @pax/worker -- --port 8798
# another terminal
SPIKE_URL=http://127.0.0.1:8798 npm run check -w @pax/worker
```

The source check asserts byte-identical Node/bundled prompts (default, empty and selected skills), persona equality, PDF hashes, rejection of corrupted assets, configured HTTPS origin checks and Secure login/logout cookies. The curl check verifies live status, privacy recipients, demo start, all PDF hashes, same-origin/foreign-origin handling, missing-key voice setup and SSE. With a Logismata token it requires at least one valid live calculation. For a real voice setup with an OpenAI key, set `VOICE_SDP_FILE` to a fresh browser-generated WebRTC SDP offer; response credentials are never printed. External checks explicitly report skips when inputs are missing.

Local task C results: 462 tests / 461 passed / one skipped / zero failed; Worker typecheck and dry run passed; source check and curl check passed. No provider secrets were present, so real calculator and external voice success are unverified. Bundle: recorded spike baseline 3740.53 KiB / gzip 763.27 KiB; task C 3772.88 KiB / gzip 773.21 KiB. PDF assets are separate from the JS bundle. No account operations or deployment were performed.

---

## Historical spike evidence (superseded substitutions)

# NestJS in a Durable Object: local feasibility spike

Verdict: **works with caveats**. Tested 2026-11-01 under Wrangler 4.156.0 / local workerd. This is a feasibility harness, not the finished migration. No account, login, remote development or deployment was used.

## Run

From the repository root, with Node 22 (also tested with Node 24.19.0):

```sh
cd code
npm ci --ignore-scripts
npm run build
npm run dev -w @pax/worker -- --port 8797
```

In another terminal, from `code/`:

```sh
npm run check -w @pax/worker
npm run typecheck -w @pax/worker
npm test
npm run build -w @pax/worker  # wrangler deploy --dry-run only
cd apps/worker
../../node_modules/.bin/wrangler check startup --outfile /tmp/life-startup.cpuprofile
```

The check script uses curl and asserts status codes, case identity/revision across requests, and the initial SSE event. Cookies are kept in a temporary directory and deleted. It prints no tokens. No `.env` or `.dev.vars` is needed. The original lockfile was out of sync with the existing Angular workspace; updating it for this workspace also reconciled those missing entries.

## What runs

`src/index.ts` routes `/api/*` to `LIFE.getByName('singleton')`. The SQLite-backed DO declaration/migration is real; this spike deliberately does not use its storage. Each DO instance memoizes its boot promise and calls the existing `createLifeInsuranceApp()` once. Nest listens on port 0; the resulting assigned port is a workerd routing key, not a network listener. DO `fetch()` awaits boot then calls `handleAsNodeRequest(port, request)`. Port 0 avoids collisions if an isolate ever hosts more than one instance. Non-API paths return 404; `/paxi/*` and Angular assets are outside this spike.

The worker imports the API's `dist` output, after `tsc -b`. This preserves TypeScript decorator metadata and keeps the existing controllers, guards, filters, Express and SSE implementation. Worker code has its own generated-runtime-type check.

Spike substitutions:

- `src/memory-store.ts`: serialized copy-on-write transactions and cloned reads, with the existing capacity/closed guards, but no encryption or persistence. All data disappears on DO eviction or dev restart. Random per-instance bootstrap credentials remain internal; public demo start requires no code.
- `ProductDocuments.empty()`: empty catalog, so PDF routes remain unavailable.
- `RuntimeOptions.personaDraft`: bundled synthetic Mueller JSON, with the normal valuation/availability date adjustments. This allows `POST /api/demo/start {}` to load the actual confirmed persona, not just an empty case.
- Stub calculation provider throws the existing `ProviderFailure('UNAVAILABLE')`. The engine records failed calculation outcomes normally; this does not prove real calculations or recommendations. Voice/model extraction remain disabled.
- `src/optional-nest.cjs` plus Worker-only aliases: empty exports for unused optional Nest integrations.

The API changes are small injection seams (`CaseStore`, `RuntimeOptions.store`, persona loader, empty document factory), plus deferred voice URL construction. Node defaults and its encrypted store remain unchanged.

## Curl evidence

First run, local loopback. Timing is wall time reported by curl, not Cloudflare production CPU time.

| Check | Result | Time |
| --- | --- | --- |
| `GET /api/status` | 200; `pax-life-insurance-backend`, providerMode `test` | 162.820 ms, first DO request |
| `GET /api/privacy` | 200; existing privacy notice | 23.088 ms |
| `POST /api/demo/start`, JSON `{}`, no access code | 201; customer role, case ID, CSRF token, HttpOnly session cookie | 126.132 ms |
| `GET /api/cases/:id`, session cookie | 200; same ID, confirmed persona and case state | 39.661 ms |
| Repeat `POST /api/demo/start {}` and case read | Same case ID and unchanged context revision | Passed |
| `GET /api/cases/:id/advisor/events`, session cookie | 200 `text/event-stream`; `advisor.context.updated`, contextRevision 11, reason `analysis_ready` | Initial event received; still open at 2 s |

The SSE curl exited 28 only because `--max-time 2` intentionally stopped the open stream; 676 bytes had arrived. `analysis_ready` is an engine event name; the stub's provider results are unavailable, not successful financial calculations. The checked-in script repeats these assertions without hardcoded case IDs.

Manual equivalent (from `code/`, do not commit the cookie or response files):

```sh
curl -i http://127.0.0.1:8797/api/status
curl -i http://127.0.0.1:8797/api/privacy
curl -sS -c /tmp/life-cookies -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:8797/api/demo/start > /tmp/life-start.json
case_id=$(node -p 'JSON.parse(require("node:fs").readFileSync("/tmp/life-start.json","utf8")).caseId')
curl -i -b /tmp/life-cookies "http://127.0.0.1:8797/api/cases/$case_id"
curl -N --max-time 2 -b /tmp/life-cookies \
  "http://127.0.0.1:8797/api/cases/$case_id/advisor/events"
rm /tmp/life-cookies /tmp/life-start.json
```

## Measurements and incompatibilities

Wrangler dry-run reported 3740.53 KiB raw / 763.27 KiB gzip (about 3.65 MiB / 0.75 MiB). [Current Workers limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size) specify **64 MiB uncompressed** on Free and Paid, with no compressed-size limit. This bundle fits; do not confuse this with older 3/10 MiB gzip limits. No live upload validation was attempted.

`wrangler check startup` (local, internally builds using `deploy --dry-run`) reported a 199.5 ms profile window, 190.9 ms sampled, **131.1 ms active**, 8.0 ms GC and 59.9 ms idle. The separate DO log reported **58 ms** from entering app creation to `app.listen()` completing. First HTTP status took 162.820 ms; later status took about 17 ms. The [1 second startup limit](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time) concerns global-scope evaluation; lazy Nest boot occurs in a DO request. These local figures do not certify production CPU limits, latency or memory under load.

| Issue encountered or checked | Evidence / handling |
| --- | --- |
| Compatibility date newer than installed workerd | `2026-11-01` rejected: newest supported date `2026-10-30`. Config now uses that date plus explicit `nodejs_compat`. |
| Optional Nest packages fail bundling | Seven resolution errors for `class-validator`, `class-transformer`, `@nestjs/microservices`, its `microservices-module.js`, and `@nestjs/websockets/socket-module.js`. Worker-only aliases export an empty object; Nest's optional transport probes find no module classes. This app uses Zod. These aliases must be removed/replaced if those features are enabled. |
| Eager `import.meta.url` filesystem URL | `voice/prompt.ts` top-level `new URL('../../../../voice-agent/', import.meta.url)` failed startup with `TypeError: Invalid URL string`. Moved construction into its existing async file loader. Disabled voice no longer evaluates it. Real voice file loading still needs an asset seam. |
| Filesystem store and `process.kill` PID probing | Bypassed through injected memory store and credentials; no claim that file locking/fsync/PID probing works in workerd. |
| Persona filesystem read | Discovered beyond the initial store/PDF dependencies. Injected loader imports the public synthetic fixture as JSON. |
| PDF and replay filesystem reads | Empty document catalog and provider stub avoid them; real PDF/replay asset delivery is pending. |
| `reflect-metadata` / Nest injection metadata | Existing side-effect import and tsc-emitted metadata work; no workaround needed. |
| `node:crypto` | Random bytes/UUIDs, SHA-256 and timing-safe comparisons used by demo/session flow work. AES-GCM persistence was not exercised. |
| `setInterval().unref()` | Existing 5 s / 60 s cleanup timers did not throw; SSE 250 ms interval works. Retention/voice sweep semantics across idle/eviction are not proven; use alarms. |
| Nest shutdown hooks / process signals | Hook registration did not throw; signals, termination and Nest's eventual `process.kill` path were not exercised. DO lifecycle must not rely on process signals. |
| Node HTTP / Express streaming | App listen, body parsing, cookie auth, response headers, guard and SSE worked through the native bridge. No framework replacement or alternate HTTP implementation. |

[Cloudflare's Node HTTP documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/#handleasnoderequest) documents the bridge and port routing. Server support is enabled automatically with `nodejs_compat` at compatibility dates from 2025-09-01. [SQLite DO migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) use `new_sqlite_classes`, as in this configuration.

## Follow-up seams

1. **Store persistence**: `apps/api/src/insurance/store.ts`, `runtime.ts`, and `apps/worker/src/memory-store.ts`. Retain serialized transaction, clone/rollback, closed-state and capacity semantics; replace volatile state with encrypted DO SQLite storage. Decide key lifecycle and enforce DO storage value limits (do not assume the existing 20 MB blob fits one KV value). Remove filesystem locking/PID probing and the temporary `directory` label dependency in `apps/api/src/main.ts`.
2. **Timers/alarms**: `apps/api/src/insurance/runtime.ts` retention and voice sweep, with existing `hasExpired` / `sweepExpired`; expose callable sweep hooks and opt out of intervals in DO. Schedule/re-arm DO alarms. SSE's active-connection poll in `insurance/http.ts` can remain in memory but needs cancellation/load validation.
3. **Documents**: `apps/api/src/insurance/documents.ts` metadata and byte loading need an asset-backed implementation preserving hash checks; replace the empty factory in this spike.
4. **Demo persona**: `insurance/demo-journey.ts` / `runtime.ts` now accept `personaDraft`; supply bundled public fixtures or an asset loader, retaining schema/date validation.
5. **Voice assets**: `apps/api/src/voice/prompt.ts` reads persona/skills and dynamically imports `voice-agent/skills.mjs`; package or inject these before enabling voice settings/generation. Lazy evaluation only avoids startup failure.
6. **Config/provider**: `RuntimeOptions` already accepts credentials/provider/voice/model options. Supply Worker env bindings/secrets directly; no dotenv/file reads. Replace the stub calculator; if choosing replay, change `apps/api/src/logismata/client.ts` archive loading. Keep `demoStart: true` explicit for the public demo.
7. **HTTP/lifecycle**: `apps/api/src/insurance/app.ts` should allow opting out of process shutdown hooks. `insurance/http.ts` has fixed localhost Origin/CSRF allowlists; supply the deployed origin before browser writes. Review production cookie attributes. Keep tsc metadata compilation and the single-DO boot promise; retain unique Node HTTP routing keys.
8. **Build**: `apps/worker/wrangler.jsonc` optional-module aliases are spike limitations, not general support for Nest microservices/WebSockets/validation pipes. Angular assets, `/paxi`, production load/memory/eviction testing and remote deployment remain outside this result.

## Verification recorded

- `npm ci --ignore-scripts`: succeeded after lockfile reconciliation, 454 packages installed.
- `npm test`: passed on Node 22.23.4 and 24.19.0; 462 tests, 461 passed, one skipped, zero failed (includes build, client typecheck and 40 shared schema checks).
- Worker generated-type check and curl self-check: passed.
- `wrangler deploy --dry-run`: succeeded, 3740.53 KiB raw / 763.27 KiB gzip after final address/date validation edits. Startup figures above were measured immediately before those small edits.
- No remote calls to Cloudflare account APIs, no deployment and no secrets committed. No production throughput, memory, alarm, restart persistence, PDFs, successful calculations or enabled voice were tested.
