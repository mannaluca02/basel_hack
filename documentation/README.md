# Dokumentation

Stand: 01.11.2026. Pax Challenge, BaselHack 2026: „Pax Digital Advisor“, ein KI-Vorsorgeberater zum Selbstbedienen. Unser Beitrag ist Paxi, mit dem man spricht.

## Das System

| Dokument | Inhalt |
|---|---|
| [Architektur](architecture.md) | Bausteine, ein Gespräch von der Stimme bis zur Police, Datenhaltung, Konfigurationen, Deployment, Tests |
| [Live-Stimme](live-voice.md) | GPT-Live, das Hintergrundmodell GPT-6 Luna, Prüfung des Gehörten, Emotionen, Rückfall |
| [Compliance und Regeln](compliance.md) | Erfundene Daten, Einwilligungen, Gesprächsregeln, Bestätigung durch die Person, Angemessenheitsprüfung, Pflichtschritte eines echten Abschlusses |
| [Requirements-Matrix](baselhack/reports/life-insurance-requirements.md) | Anforderungen der Challenge und von Pax, zugeordnet zu Code und Tests, mit Live-Nachweis |

## Schnittstellen und Module

| Dokument | Inhalt |
|---|---|
| [Team-API-Leitfaden](baselhack/plans/team-api-guide.md) | Routen, Rollen, Payloads, Versionsschutz, SSE |
| [Schnittstellen I01–I10](baselhack/plans/interface-contracts.md) | Die Verträge aus dem Workshop und ihre Schemas in `@pax/contracts` |
| [Extraktion und Vorschlagspakete](baselhack/plans/erni-extractor-integration.md) | Extraktor-Kontext, Pakete, Ersetzen, Unklarheiten |
| [Bestätigungen und Unklarheiten](baselhack/plans/voice-confirmation-and-dialogue.md) | Gebundene Kundenbestätigungen, Gesprächsstatus beantworteter Unklarheiten |
| [Voice-Sessions im Backend](baselhack/plans/voice-backend-integration.md) | `/voice/sessions`, Transkript, GPT-Live- und ElevenLabs-Adapter |
| [Persönliche Beratung](baselhack/plans/human-advisor-handover.md) | Der Übergabe-Schalter und was er stoppt |
| [Live-Voice und Voice Lab](baselhack/plans/voice-lab-debugging.md) | Starten, Debug-Konfiguration, Trace |
| [Paxi-Voice-Agent](../code/voice-agent/README.md) | Darios eigenständiger Paxi, Persona, Skills, Fragebogen |
| [Worker](../code/apps/worker/README.md) | Cloudflare-Betrieb, Prüfung, Diagnose |

## Fachwissen

| Dokument | Inhalt |
|---|---|
| [Beratungsplan](baselhack/plans/advisor-plan.md) | Drei Säulen, Personas, Pax-Vorsorgecheck, Empfehlungen „Bedarf vor Produkt“, Produktkatalog |
| [Öffentliche Pax/vlot-Analyse](baselhack/reports/public-pension-analysis.md) | Der heutige öffentliche Ablauf von Pax als Vergleich |
| [Freundliche Verkaufsgespräche](baselhack/research/friendly-sales-conversation.md) | Grundlage von Paxis Gesprächsführung (Skill `friendly-conversation`) |
| [Pax-UI-Bausteine](baselhack/research/pax-ui-controls.md) | Gemessene Pax-Styles und die bewussten Abweichungen für WCAG AA |
| [Referenzen](baselhack/references/README.md) | Produkt-PDFs und Logismata-Beispiele, die Code und Tests benutzen |
| [Challenge-Material](challenge_material/) | Challenge-Text, Logismata-OpenAPI, Rechtsrahmen, Personas, Musteranalysen und Offerten von Pax |

## Eckdaten

- **Challenge-Hub:** https://pax-hackathon-2026.vercel.app (Passwort in der lokalen `.env` als `PAX_HUB_PASSWORD`).
- **Logismata-API:** `https://baselhackathon2026.azurewebsites.net/viper`, Token in der `.env` als `LOGISMATA_BEARER_TOKEN`; läuft am **03.11.2026 23:59:59** ab.
- **Live:** https://paxi.rushworks.workers.dev (Cloudflare Worker `paxi`).

Zugangsdaten stehen nie in getrackten Dateien: alles liegt in der gitignorierten `.env` im Repo-Root, Vorlage [`.env.example`](../.env.example); auf dem Worker in den Cloudflare-Secrets.
