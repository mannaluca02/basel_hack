# Historical local feasibility measurements

Recorded on 2026-11-01 with Wrangler 4.156.0 and local workerd; these are historical observations, not production guarantees or current limitations.

- Initial Nest-in-DO bundle: 3740.53 KiB raw / 763.27 KiB gzip. After live sources integration: 3772.88 KiB / 773.21 KiB. PDF assets are separate.
- Initial local startup profile: 199.5 ms window, 131.1 ms active, 8.0 ms GC. Lazy Nest boot logged 58 ms; first status request took 162.820 ms. These figures do not certify production CPU, memory or latency.
- Optional Nest integrations required Worker-only aliases; `nodejs_compat` and compatibility date `2026-10-30` worked locally. Deferred filesystem loaders and injected runtime assets allowed Nest to boot without Node filesystem access.
- Early substitutions have since been replaced by encrypted durable storage, live providers, bundled documents/prompts and Angular assets. No Cloudflare account or live deployment was used for these measurements.

See [README.md](README.md) for the current architecture and commands.
