# Documentation index

Everything we know about the Pax Challenge (BaselHack 2026), collected on 2026-10-30
from the challenge hub, the Logismata API and the material PDFs.

| File | Contents |
|---|---|
| [Friendly sales conversations: research and examples](baselhack/research/friendly-sales-conversation.md) | Evidence on follow-up questions, autonomy and reactance; Paxi pitch, sample dialogue, hesitation handling and proposed improvements. Distilled into Paxi's skill [`friendly-conversation.md`](../code/voice-agent/skills/friendly-conversation.md) |
| [Voice feature: setup and integration](../code/voice-agent/README.md) | Paxi demo, configuration, browser callbacks, HTTP API, language switching, questionnaire extraction, logs and troubleshooting |
| [Customer data portfolio](../code/voice-agent/questionnaire.json) | All 53 customer details Pax needs (person, family, income, living, provision, goals, calculation needs, suitability check), with tier, type, casual question, backend contract path and source; used by the Paxi voice agent |
| [Voice backend integration](baselhack/plans/voice-backend-integration.md) | Nest routes, shared observations, 37-field mapping, provider setup and Dario/Erni handoff |
| [Model extraction notice](baselhack/plans/model-extraction-notice.md) | Separate OpenAI extraction notice, hash-bound customer consent and Earnie's server-side gate |
| [Logic backend implementation](baselhack/reports/logic-backend-implementation.md) | Runtime schemas, domain calculations, NestJS demo, Logismata adapter and validation evidence |
| [Workflow and interface contracts](baselhack/plans/interface-contracts.md) | VoiceLog, shared case, calculation result, replies, playback and export contracts from the second photo |
| [Workshop decisions](baselhack/plans/workshop-decisions.md) | Confirmed UI/roles, feature interpretation and explicit open details |
| [Detailed Angular implementation plan](baselhack/plans/implementation-plan.md) | Screens, domain logic, AI, interfaces, state machine, security and 55 acceptance cases |
| [Implementation backlog](baselhack/plans/implementation-backlog.md) | 37 workshop tickets (34 P0), named owners, dependencies, estimates and acceptance criteria |
| [Advisor plan: requirements](baselhack/plans/advisor-plan.md#3-anforderungen-an-das-ergebnis) | Must-haves, nice-to-haves, no-gos, legal framework turned into concrete requirements, demo checklist |
| [Logismata API](baselhack/references/api/) | Logismata APICalc: auth, all 24 operations, enum codes, verified example calls, quirks |
| [Advisor plan: domain and recommendations](baselhack/plans/advisor-plan.md) | Swiss 3-pillar basics, personas, Pax "Vorsorgecheck" structure, suitability scoring, Pax product catalogue |
| [Sources and tools](baselhack/references/README.md) | Challenge hub, reference calculators, Quicksale, Pax UI (Angular), Pax brand |
| [Public Pax/vlot analysis test](baselhack/reports/public-pension-analysis.md) | Current public flow, synthetic fixture, 17-page PDF export and open findings |
| [Five-person team plan](baselhack/plans/team-plan.md) | Responsibilities, schedule and integration checkpoints |
| [challenge_material/challenge.md](challenge_material/challenge.md) | Original challenge text from baselhack.ch |
| [challenge_material/APICalc-swagger.yaml](challenge_material/APICalc-swagger.yaml) | OpenAPI 3.1 spec of the Logismata API (downloaded from the hub) |
| `challenge_material/*.pdf` | The 10 material PDFs (German only) |

## Key facts at a glance

- **Challenge:** "Pax Digital Advisor", an AI self-service pension advisor. Sponsor Pax, prize CHF 1,500.
- **Hub:** https://pax-hackathon-2026.vercel.app (password protected, password in local `.env` as `PAX_HUB_PASSWORD`).
- **API:** `https://baselhackathon2026.azurewebsites.net/viper`, the research token is local in `baselhack/private/logismata.env` as `LOGISMATA_BEARER_TOKEN`; application template variable: `LOGISMATA_TOKEN`.
- **Token expiry:** 2026-11-03 23:59:59 (decoded from the JWT `exp` claim).
- **Domain experts on site:** Cem and Claude (Pax), Friday and Sunday.
- **Follow-up for winners:** further PoC work with the Pax innovation team, possible working-student positions or theses.

## Secrets

The hub password and the API token are **not** stored in tracked files, because this
repository is on GitHub. The research token is stored in `baselhack/private/logismata.env` with permissions `0600`; the entire private directory is gitignored.
For application setup, `.env.example` is the template for an optional local `.env` at the repo root. Its variable names differ from the research file, so map the token explicitly when configuring the application.
