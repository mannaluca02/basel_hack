# Verarbeitungshinweis und Zustimmung für Earnies synthetische OpenAI-Extraktion

Stand: 31.10.2026. Gemeinsamer Backend-Teil aus [Ticket 02](../../../.scratch/ernest-ai-backend/issues/02-kundenclient-pruefstand-bestaetigung.md) und Abschnitt 2 der [Integrationsvereinbarung](../../../.scratch/ernest-ai-backend/integration-agreement.md). Implementierung: [Vertrag](../../../code/packages/contracts/src/model-extraction.ts), [Service](../../../code/apps/api/src/insurance/model-extraction.ts), [Tests](../../../code/tests/model-extraction.test.mjs).

## Was das Backend jetzt garantiert

- Eigener Hinweis `extraction-synthetic-v1`, getrennt vom aktuellen Profil-/Rechnerhinweis (`lifemap-synthetic-v2`) und der Sprachdemo (`voice-synthetic-v1`). Keine dieser Zustimmungen ersetzt eine andere; ältere bestätigte Snapshots behalten ihre ursprüngliche Hinweisversion.
- Der Hinweis nennt OpenAI (Responses API), den Zweck (Feldextraktion aus dem Gespräch) und genau die vereinbarte synthetische Projektion: erfundener Gesprächsausschnitt, pseudonyme Personen-ID, betroffene Feldwerte mit Einheit und Einkommensbasis, erlaubte Zielpfade, zugehörige Rückfragen. Ausgeschlossen: vollständiger Fall, Revisionen/Hashes/Berechtigungen, Zugangsdaten, Audio, Gesundheits- und echte Kundendaten.
- `noticeHash` ist ein SHA-256 über Version, Empfänger, Umfang und alle vier Sprachtexte. Jede inhaltliche Änderung ergibt einen neuen Hash; eine gespeicherte Zustimmung zum alten Inhalt erlaubt dann keine Übertragung mehr (`blockedReason: notice_changed`).
- Standardmäßig deaktiviert. Erst `PAX_SYNTHETIC_EXTRACTION_ENABLED=1` aktiviert den Weg; `/api/privacy` meldet dann `externalAiTransfer: true`, ergänzt den Empfänger und hängt den Text an `display.recipients` an, in DE/FR/IT/EN. Ist der Weg aus, behauptet kein Hinweis eine KI-Übertragung.
- `ExtractorContext.policy.noExternalAiTransferAuthorized` bleibt `true`: Die Zustimmung deckt nur Earnies minimale Projektion, nie den gesamten Kontext.

## Routen

| Methode / Pfad | Berechtigung | Zweck |
|---|---|---|
| `GET /api/extraction/privacy?locale=de` | öffentlich | Hinweis, Text, Umfang, `noticeHash`, `enabled` |
| `GET /api/cases/:caseId/extraction/consent` | Kunde / Fall-Agent | aktueller Status: `transferAllowed`, `blockedReason` |
| `POST /api/cases/:caseId/extraction/consent` | Kunde + CSRF | Zustimmung genau zu diesem `noticeHash` |
| `POST /api/cases/:caseId/extraction/consent/revoke` | Kunde + CSRF | Widerruf; auch während einer Beraterübergabe |

Zustimmung:

```json
{
  "expectedCaseRevision": 4,
  "noticeVersion": "extraction-synthetic-v1",
  "noticeHash": "HASH_AUS_GET_/api/extraction/privacy",
  "dataClassification": "synthetic",
  "allowSyntheticModelExtraction": true
}
```

Zustimmung und Widerruf erhöhen die Fallrevision und invalidieren offene Bestätigungsfragen wie jede andere Falländerung. `blockedReason` ist einer von `disabled`, `consent_missing`, `notice_changed`, `human_handover_active`.

## Luca (Angular)

Vor dem ersten extrahierten Gesprächsturn den Hinweis aus `GET /api/extraction/privacy` in der aktuellen Sprache anzeigen und mit dem zurückgegebenen `noticeHash` zustimmen lassen; Beispiel: `acceptModelExtractionNotice` in [team-client.ts](../../../code/examples/contracts/team-client.ts). Bei `MODEL_EXTRACTION_NOTICE_CHANGED` oder `blockedReason: notice_changed` den neuen Hinweis erneut anzeigen. Ohne Zustimmung bleibt die manuelle Erfassung möglich.

## Earnie (ErniDialogModule)

Im selben Nest-Prozess `LIFE_RUNTIME` injizieren und **unmittelbar vor jedem Modellaufruf** sowie **vor dem Einreichen** über `proposeBatch()` prüfen:

```ts
runtime.modelExtraction.assertTransferAllowed(agentActor, caseId);
```

Fehler: `MODEL_EXTRACTION_DISABLED` (503), `MODEL_EXTRACTION_CONSENT_REQUIRED` (403), `HUMAN_HANDOVER_ACTIVE` (409). Nur Fall-Agenten dürfen das Gate aufrufen; der Agent bekommt dadurch keine Kunden- oder Bestätigungsrechte. Der OpenAI-Schlüssel bleibt serverseitig (`OPENAI_API_KEY`). Separate Prozesse lesen `GET /api/cases/:caseId/extraction/consent` mit dem Agent-Grant.
