# Paxi on Cloudflare Workers

The `paxi` Worker serves the Angular `live-production` build and the live NestJS API on one origin: `https://paxi.<subdomain>.workers.dev`. Deployment instructions are in [code/README.md](../../README.md#deploy-on-cloudflare).

## Architecture

- `/api` and `/api/*` go to `LIFE.getByName('singleton')`: one SQLite-backed Durable Object, which boots Nest once using `nodejs_compat` and forwards requests through `handleAsNodeRequest`. Nest's port 0 is an internal routing key, not a public listener. Optional unused Nest transport/validation modules are aliased; validation uses Zod.
- `/_products` and descendants return 404. All other paths use the assets binding with SPA fallback. Product PDFs are available only through authenticated API routes.
- The store encrypts the complete case database with AES-256-GCM and writes an atomic manifest plus 1,000,000-character chunks to DO storage. Reads are cloned; writes serialize copy/encrypt/commit/state replacement. Cases and generated fallback access credentials survive restarts. Missing or changed `LIFEMAP_STORE_KEY` fails closed; losing it makes existing cases unreadable.
- DO alarms replace Node timers for voice expiry and retention cleanup, including after eviction; writes rearm the next cleanup deadline.
- The build compiles the API, syncs avatars and builds Angular `live-production`, then bundles prompt/skills, the normalized synthetic persona and a SHA-256 PDF manifest. PDFs are copied after Angular clears its output. Runtime checks PDF integrity at boot and download. `assets/` and `generated/` are ignored build outputs.
- HTTP writes enforce same-origin CSRF checks (or explicit `PAX_PUBLIC_ORIGIN`). Forwarded host/protocol come from the actual URL. HTTPS session/logout cookies use Secure. HTML has CSP, frame denial and same-origin microphone permissions; assets use nosniff. HTML and service-worker metadata use no-cache. Angular's service worker caches static files only, never API/SSE/PDF data; close old tabs and reopen after deployment to use the installed version.
- Shared `providerFetch` strips cookies, omits ambient credentials, uses manual redirects and rejects every 3xx response rather than forwarding provider credentials to another destination.
- Dario's `code/voice-agent/server.mjs` is not deployed. Its persona/skills feed the backend's built-in live voice.

## Local setup and verification

Use Node 22+ and npm. From `code/`:

```sh
npm ci --ignore-scripts
npm run setup:local -w @pax/worker
npm run build -w @pax/worker
npm run typecheck -w @pax/worker
node apps/worker/scripts/sources-check.mjs
npm test
npm --prefix apps/web test -- --watch=false
npm run check:persistence -w @pax/worker
npm run dev -w @pax/worker -- --port 8797
```

`setup:local` creates ignored `apps/worker/.dev.vars` with a random local store key if absent; it does not overwrite an existing file. See `.dev.vars.example` for provider and optional access-code names. Add real provider values locally; never commit or print secrets. Root `.env` is not automatically loaded by this Worker setup. `build` runs `wrangler deploy --dry-run`, without login or deployment.

In another terminal, from `code/`:

```sh
WORKER_URL=http://127.0.0.1:8797 npm run check -w @pax/worker
```

`WORKER_URL` selects the target (`SPIKE_URL` remains a legacy fallback). The check covers SPA/assets, API status, consent/privacy, demo sessions, PDF hashes, CSRF and SSE; it requires a real calculation when a Logismata token is configured. For external voice setup, provide `VOICE_SDP_FILE` pointing to a fresh browser WebRTC SDP offer. Missing provider inputs are reported as skips, not proof of end-to-end success. `sources-check` compares bundled prompts/persona/PDFs, tests corrupt assets and HTTPS origin/cookie behavior. Persistence verification starts and stops its own isolated local Worker and checks restart recovery and encrypted SQLite contents; Python 3 is required. Stop the interactive dev server with Ctrl-C.

## Configuration

Non-secret defaults live in `wrangler.jsonc`; secrets use `.dev.vars` locally and Wrangler secrets remotely.

| Setting | Default / purpose |
| --- | --- |
| `PAX_DEMO_START` | `1`: intentionally open demo start, no access code |
| `PAX_SYNTHETIC_VOICE_ENABLED` | `1`: built-in live voice |
| `PAX_SYNTHETIC_EXTRACTION_ENABLED` | `1`: model extraction |
| `LIVE_MODEL`, `LIVE_VOICE` | `gpt-live-1`, `juni`: live voice model/voice |
| `PAX_PUBLIC_ORIGIN` | Empty: request origin; otherwise exact public HTTPS origin for write-origin checks |
| `LIFEMAP_STORE_KEY` (secret) | Required base64-encoded 32-byte encryption key; preserve safely across deploys |
| `LOGISMATA_BEARER_TOKEN` (secret) | Required for live calculations; challenge hub Tools token expires 2026-11-03 23:59:59 |
| `OPENAI_API_KEY` (secret) | Required for live OpenAI voice/extraction |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (secrets) | Optional ElevenLabs voice integration |
| `PAX_CUSTOMER_ACCESS_CODE`, `PAX_REVIEWER_ACCESS_CODE` (secrets) | Optional login overrides; otherwise generated once and persisted; do not gate demo start |

Workers logs are enabled via `observability.enabled` ([Cloudflare configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#observability)).

## Diagnose

From `code/`, run:

```sh
CLOUDFLARE_ACCOUNT_ID=d4d88ec43765f1f4f61b1f9214b3f721 npm run diagnose -w @pax/worker
# Include successful requests or pass Wrangler filters:
npm run diagnose -w @pax/worker -- --all --search api_error
# Parse saved local wrangler-dev console output (or pipe it over stdin):
npm run diagnose -w @pax/worker -- --stdin < local-worker.log
```

The command tails read-only; Ctrl-C stops it. It prints API errors, boot/alarm failures, uncaught exceptions and non-ok outcomes. Tail can sample away requests under load. The same structured `api_error` lines are kept in **Cloudflare Dashboard → Workers & Pages → paxi → Observability**; search logs for `api_error`, then filter by `code`, shortened `case` or `session`. Logging is enabled in the Worker and off by default for Node. Console output from inside the Durable Object did not reach `wrangler tail` in production (verified 2026-11-01), so the Worker in front writes the `api_error` line for every `/api` response with status >= 400 from the small JSON error body (code and field names only). The Durable Object's own lines, including 500 details with name, message and first stack frames, may still be visible in Observability.

The live browser message includes the error code. In browser DevTools → Console, filter `[paxi]`: `api_error` has method/path/status/backend code; `voice_error` has the client code and selected provider error details; `TURN_ROUTING_FAILED` also has the underlying HTTP status/code. IDs are shortened and query strings omitted. Logs exclude request bodies, cookies and transcripts; treat exception/provider messages as diagnostic information, not customer data.

## Accepted demo limitations

One DO serves everyone; this is suitable for a jury, not a horizontally scaled service. The store holds at most 25 cases. At capacity, a new demo start replaces replaceable cases (unreachable first, then oldest), which can end an active visitor's session. `/api/demo/start` is not rate limited. Set provider spending limits before judging. Microphone access requires HTTPS outside localhost; workers.dev provides it. Real provider success and a phone smoke test still need deployed credentials and the public URL.

