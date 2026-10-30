# Documentation index

Everything we know about the Pax Challenge (BaselHack 2026), collected on 2026-10-30
from the challenge hub, the Logismata API and the material PDFs.

| File | Contents |
|---|---|
| [challenge-analysis.md](challenge-analysis.md) | Must-haves, nice-to-haves, no-gos, legal framework turned into concrete requirements, demo checklist |
| [logismata-api.md](logismata-api.md) | Logismata APICalc: auth, all 24 operations, enum codes, verified example calls, quirks |
| [domain.md](domain.md) | Swiss 3-pillar basics, personas, Pax "Vorsorgecheck" structure, suitability scoring, Pax product catalogue |
| [tools.md](tools.md) | Challenge hub, reference calculators, Quicksale, Pax UI (Angular), Pax brand |
| [challenge_material/challenge.md](challenge_material/challenge.md) | Original challenge text from baselhack.ch |
| [challenge_material/APICalc-swagger.yaml](challenge_material/APICalc-swagger.yaml) | OpenAPI 3.1 spec of the Logismata API (downloaded from the hub) |
| `challenge_material/*.pdf` | The 10 material PDFs (German only) |

## Key facts at a glance

- **Challenge:** "Pax Digital Advisor", an AI self-service pension advisor. Sponsor Pax, prize CHF 1,500.
- **Hub:** https://pax-hackathon-2026.vercel.app (password protected, password in local `.env` as `PAX_HUB_PASSWORD`).
- **API:** `https://baselhackathon2026.azurewebsites.net/viper`, bearer token in local `.env` as `LOGISMATA_TOKEN`.
- **Token expiry:** 2026-11-03 23:59:59 (decoded from the JWT `exp` claim).
- **Domain experts on site:** Cem and Claude (Pax), Friday and Sunday.
- **Follow-up for winners:** further PoC work with the Pax innovation team, possible working-student positions or theses.

## Secrets

The hub password and the API token are **not** stored in tracked files, because this
repository is on GitHub. Both live in `.env` at the repo root, which is gitignored.
To set it up, copy `.env.example` to `.env` and fill in the values from the hub.
