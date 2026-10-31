# Gemeinsamer Fall und Team-Schnittstellen

Aktuelle Erweiterung für Ernis Modul: [Extraktor-Projektion, atomare Vorschlagspakete, Korrekturen und Unklarheiten](erni-extractor-integration.md). Für neue Extraktion die dort beschriebene Paket-API verwenden.

Stand: 31.10.2026 · ausführbarer Vertragsstand `schemaVersion: "1.0"` · synthetischer PoC.

Alle Team-Komponenten importieren ihre Fachdaten-/Nachrichtentypen aus **`@pax/contracts`**. Das Paket enthält Zod-Schemas und daraus abgeleitete TypeScript-Typen, ohne NestJS-, Node- oder Domain-Laufzeitabhängigkeit. Der vollständige Fall ist `InsuranceCaseDto` bzw. dessen Alias `InsuranceCase`; das Laufzeitschema heisst `InsuranceCaseDtoSchema` bzw. `InsuranceCaseSchema`.

Der Server bleibt die gemeinsame Datenquelle. Luca rendert die freigegebenen Fall-/Ergebnisdaten, Earnie orchestriert bestätigbare Vorschläge und Antworten, Dario transportiert Transkript und Audio, Lukas rendert Fortschritt und tatsächliche Playbackzustände. Alle verwenden dieselbe Fall-ID und passende Versionen. Die Rollen sind keine vom Client frei behaupteten Berechtigungen.

## 1. Einstieg und Dateien

Im Verzeichnis `code/`:

```bash
npm ci --ignore-scripts
npm test
npm start
```

`npm start` verwendet den geschützten vorhandenen Logismata-Servertoken. Basisadresse: `http://127.0.0.1:3000/api`. Zugangscodes werden beim ersten Start lokal unter `code/.local/lifemap/access-codes.json` angelegt; sie gehören nicht in Git, Chat, Logs oder das Angular-Bundle. Die private Token-Datei wird beim Klonen nicht mitgeliefert. Ein berechtigter API-Operator konfiguriert seinen Sponsorzugang separat; Frontend-Arbeit ohne diesen Zugang kann die validierten synthetischen JSON-Beispiele verwenden. Details stehen im [Startleitfaden](../../../code/README.md).

| Datei | Inhalt |
|---|---|
| [insurance-case.ts](../../../code/packages/contracts/src/insurance-case.ts) | Vollständiger Fall, Profile, Empfehlungen, Reviews, Verträge, Vergleiche und Anzeigesichten |
| [advisor-context.ts](../../../code/packages/contracts/src/advisor-context.ts) | Minimierter Agent-Kontext, Rückfragen, Fortschritt, Sitzungs-/Fehlerantworten, SSE-Daten |
| [conversation.ts](../../../code/packages/contracts/src/conversation.ts) | VoiceLog, AgentReply, VoicePlaybackEvent, GraphExplanationRequest |
| [summary.ts](../../../code/packages/contracts/src/summary.ts) | Portal und Kunden-/Fachpersonen-Summary desselben Snapshots |
| [financial.ts](../../../code/packages/contracts/src/financial.ts), [insurance.ts](../../../code/packages/contracts/src/insurance.ts), [life-analysis.ts](../../../code/packages/contracts/src/life-analysis.ts) | Fachliche Eingaben und vollständige Rechenausgaben |
| [team-client.ts](../../../code/examples/contracts/team-client.ts) | Tatsächlich kompilierte Client-Beispiele für alle Rollen |
| [JSON-Schemas](../../../code/packages/contracts/schemas/) | Zehn versionierte Exporte für z. B. Python-Komponenten |

`npm run typecheck:clients` kompiliert die Team-Beispiele mit DOM-Typen und ohne Node-Ambienttypen. `npm run contracts:export` aktualisiert die JSON-Schemas; `npm run contracts:check` prüft deren Aktualität. Beide Prüfungen sind Teil von `npm test`. `npm run contracts:examples` erzeugt ausserdem sechs vollständig synthetische [zusammengehörige JSON-Beispiele](../../../code/fixtures/contracts/). Sie enthalten keine Sitzungs-/Providerzugangsdaten und verwenden einen injizierten Testprovider; ihre IDs sind keine bestehenden Serverfälle. Die laufende API liefert `/api/openapi.json` mit denselben Eingabe-/Antwortschemas und einer SSE-Datenschema-Referenz.

```ts
import {
  InsuranceCaseDtoSchema, AdvisorContextSchema,
  type InsuranceCaseDto, type AdvisorContext,
} from '@pax/contracts';

const response = await fetch(`/api/cases/${caseId}`, {
  credentials: 'include',
});
if (!response.ok) throw await response.json();
const current: InsuranceCaseDto = InsuranceCaseDtoSchema.parse(await response.json());
```

Angular muss dafür innerhalb des `code/`-Workspaces das Paket `@pax/contracts` referenzieren. Ein Browser sollte über Lucas Same-Origin-Proxy `/api` zugreifen. Ausserhalb dieses Monorepos kann das gebaute Paket lokal gepackt oder auf dieselbe Repo-Version referenziert werden; keine separate Kopie der Fachtypdefinitionen pflegen. Das Paket ist privat und wird durch diese Arbeit nicht in eine Registry veröffentlicht.

## 2. Gemeinsamer Fall-DTO

| Feld | Bedeutung | Wer ändert es? |
|---|---|---|
| `schemaVersion` | Wire-Vertrag, aktuell `1.0` | Server/Vertragsversionierung |
| `id`, Zeitstempel, `expiresAt` | Fallidentität und PoC-Ablauf | Server |
| `locale`, `timeBudgetMinutes` | DE/FR/IT/EN und Gesprächsumfang | Kunde über `/preferences` |
| `caseRevision` | Versionsschutz für schreibende Befehle | Server |
| `contextRevision` | Änderungen für Darstellung und Gespräch | Server, über SSE beobachtbar |
| `draft`, `draftDirty` | Aufnahmezustand: `financial`, `insurance`, `goals`, `reviewFlags` | Autorisierte Kundenaktion oder akzeptierter Vorschlag |
| `confirmedVersions` | Unveränderliche bestätigte Profile | Server nach ausdrücklicher Kundenbestätigung |
| `activeRunId`, `runs` | Aktive Berechnung und gespeicherte Historie | Server nach gültigem Rechenauftrag |
| `comparisons` | Referenzierte Szenariovergleiche | Server |
| `recommendations`, `reviewTasks` | Regelbasierte Vorschläge und getrennte Fachprüfung | Fachlogik / berechtigte Reviewer-Rolle |
| `quotes`, `applications`, `policies` | Klar getrennte Demo-Vertragsobjekte | Geprüfte serverseitige State Machine |
| `graphContext` | Auswahl von Grafik/Kennzahl/Person/Zeitraum | Kunde über validierte UI-Aktion |
| `events`, `proposals`, `estimates`, `toolRuns` | Ereignisse, bestätigbare Änderungen und isolierte Schätzungen | Autorisierte Backend-Befehle |
| `presentation` | Übersetzte Anzeigeprojektionen; kein zweiter Finanzstand | Server aus dem vorhandenen Fall |

**Öffentliche Projektion:** `ownerId`, interne Sitzungs-/CSRF-Hashes und der serverseitige `idempotency`-Cache gehören nicht zum Fall-DTO. Die private Persistenz erweitert denselben gemeinsamen Fachdatenzustand um diese internen Felder. Frontend-Autorisierung darf sich nicht auf ein frei gesetztes Eigentümerfeld stützen.

**Änderung gegenüber dem bisherigen unversionierten Export:** Fallantworten tragen jetzt `schemaVersion: "1.0"`, `toolRuns` ist immer ein Array, interne Eigentümer-/Befehlsdaten werden nicht mehr ausgegeben. Die API validiert den vollständigen DTO einschliesslich Querverweisen. Create, GET, Draft-Patch und Profilbestätigung verwenden denselben Antworttyp. Ein vollständiger Antwort-DTO ist kein erlaubter Schreibpayload.

Geldwerte sind ganze CHF-Rappen; Perioden stehen explizit an den Werten. `null` bleibt unbekannt, bestätigte `0` bleibt null Franken. Prozentannahmen stehen gegebenenfalls in Basispunkten. ISO-Zeitstempel sind UTC-Instants; `YYYY-MM` ist ein Planungsmonat. IDs, Statuscodes und Quellenreferenzen bleiben sprachunabhängig. Das Backend liefert übersetzte Anzeigedaten sowie `/translations?locale=fr`.

## 3. Sitzungen, Besitz und Rechte

`POST /api/sessions` erwartet `{ "accessCode": "<lokaler Zugangscode>" }`. `SessionResponseSchema` beschreibt die Antwort. Der Server setzt ein HttpOnly-/SameSite-Cookie; Cookie-Schreibzugriffe benötigen den zurückgegebenen `csrfToken` als `X-CSRF-Token`. Der UI-Client hält diesen CSRF-Wert für Reload in `sessionStorage`; Provider- und Reviewer-Zugangsdaten bleiben serverseitig bzw. beim Demo-Operator.

Ein neuer Kunden-Login erzeugt einen neuen anonymen Demo-Besitzer. Zwei Teammitglieder mit getrennten Logins sehen nicht automatisch denselben Fall. Für einen durchgehenden Kundenflow verwendet Angular dieselbe Sitzung; der Kunde erteilt Earnies Backend über `POST /cases/:id/agent-access` einen auf diesen Fall beschränkten kurzlebigen Agentzugang. `AgentAccessResponseSchema` beschreibt ihn. Der Agent-Bearer bleibt bei Earnies Serverintegration und darf nicht in URL-Queryparameter oder ins öffentliche Bundle geraten.

| Zugriff | Kunde | Fallgebundener Agent | Reviewer |
|---|---|---|---|
| Vollständiger Fall | Nur eigene Fälle | Nein | Erst nach Review-Anfrage |
| Agent-Kontext / SSE | Eigener Fall | Nur erteilter Fall | Berechtigter Review-Fall |
| Entwurf bestätigen / Vertrag wählen | Ja | Nein | Keine Kundenbestätigung ersetzen |
| Erlaubten Patch vorschlagen | Über Eingabe-/KI-Weg | Ja | Kein Agent-Sonderrecht |
| Review / Demo-Annahme / Demo-Police | Nein | Nein | Getrennte Rolle erforderlich |

Sitzung: eine Stunde. Agentzugang: höchstens 15 Minuten und nicht länger als die Kundensitzung. Logout widerruft auch zugehörige Agentzugänge. Authentisierung, Rollen und Datenschutzfreigabe werden nicht durch erfolgreiche Schema-Validierung ersetzt.

## 4. Verbindliche Backend-Routen

Alle folgenden Pfade beginnen mit `/api`. `:id` bezeichnet die serverseitige Fall-ID.

| Aufruf | Eingang | Antwort / Verwendung |
|---|---|---|
| `GET /privacy?locale=de` | Sprache oder Accept-Language | Hinweis vor Datenerfassung; nur synthetische Daten |
| `POST /cases` | `CreateInsuranceCaseSchema` | `InsuranceCaseDtoSchema` |
| `GET /cases/:id` | Sitzung und ID | `InsuranceCaseDtoSchema` |
| `PATCH /cases/:id/draft` | `DraftPatchSchema`, insbesondere `expectedCaseRevision` | `InsuranceCaseDtoSchema` |
| `GET /cases/:id/questions` | Aktueller Fall | `QuestionsResponseSchema` |
| `POST /cases/:id/confirmations` | `ConfirmProfileSchema` | `InsuranceCaseDtoSchema` |
| `POST /cases/:id/calculations` | `RunAnalysisSchema` | `LifeAnalysisResponseSchema` mit `run` und `presentation` |
| `POST /cases/:id/comparisons` | Baseline-/Varianten-Run und erwartete Profilversion | `ScenarioComparisonSchema` |
| `POST /cases/:id/active-analysis` | `{runId}` | Gespeicherter Lauf ohne neue Rechenkosten |
| `POST /cases/:id/recommendations` | `{}` | `RecommendationPresentationSchema` |
| `POST /cases/:id/reviews` | `{}` | Gespeicherte Review-Aufgabe |
| `POST /cases/:id/review-decisions` | `ReviewDecisionSchema` | Reviewer-Entscheidung |
| `POST /cases/:id/agent-access` | `{}` | `AgentAccessResponseSchema` |
| `GET /cases/:id/advisor/context` | Kunde oder Agent-Bearer | `AdvisorContextSchema` |
| `GET /cases/:id/advisor/events` | Derselbe berechtigte Kontext | SSE; Daten: `AdvisorContextUpdatedSchema` |
| `POST /cases/:id/advisor/proposals` | `AdvisorProposalInputSchema` | `AgentProposalSchema`; nur Agent |
| `POST /cases/:id/advisor/proposals/:proposalId/accept` | `AcceptProposalInputSchema` | Neue Revision; Gesamtbestätigung bleibt notwendig |
| `POST /cases/:id/graph-context` | Ausschliesslich `GraphContextSchema` | Exakt geprüfte Grafikfakten |
| `PATCH /cases/:id/preferences` | `CasePreferencesSchema`; mindestens Locale oder Zeitbudget | Neue Kontextrevision, Finanzlauf bleibt gültig |
| `GET /cases/:id/summaries` | Kunde oder Reviewer | `SummaryBundleSchema` |
| `GET /cases/:id/portal` | Kunde oder Reviewer | `PortalDtoSchema` |
| `GET /cases/:id/dossier?format=html&audience=customer` | Gewählte Sicht | Lesbarer viersprachiger Druckexport |

Der ausführbare [Startleitfaden](../../../code/README.md) und OpenAPI dokumentieren zusätzlich alle 24 Rechner, Dokumentdownloads, Demo-Vertragsbefehle, NPS und Insights. Die genannten Shared-Schemas ersetzen keine fehlenden Endpunkte: insbesondere sind VoiceLog/AgentReply/Playback Team-Nachrichten, keine hier zusätzlich bereitgestellten STT-/LLM-/TTS-HTTP-Services.

## 5. Arbeitsablauf pro Teammitglied

### Luca – Angular

1. Same-Origin-Proxy, Datenschutzhinweis, Login und neuen Fall verbinden.
2. `InsuranceCaseDtoSchema.parse()` auf eingelesenen Fall anwenden. Fachobjekte und übersetzte `presentation` verwenden.
3. Formulare mit `DraftPatchSchema` und der zuletzt gelesenen Revision senden. Nur beabsichtigte Teilbereiche übergeben; keine schreibbare Kopie des gesamten Fall-DTO erzeugen.
4. Nach Kundenbestätigung `ConfirmProfileSchema` senden, danach `RunAnalysisSchema`. Grafiken aus `run` und passenden Anzeigen aus `presentation` rendern.
5. Für „Diese Stelle erklären“ den inneren GraphContext an `/graph-context` senden. Der gemeinsame `GraphExplanationRequestSchema` beschreibt zusätzlich die Nachricht mit Frage/Turn an Earnie, nicht den HTTP-Body dieses Endpunkts.
6. Kunden-/Fachperson-Summary aus `SummaryBundleSchema` verwenden; keine zweite finanzielle Zusammenfassung berechnen.

### Earnie – KI-/Dialog-Backend

Vor jedem Turn den minimalen `AdvisorContextSchema` laden. Er enthält Sprache/Tempo, fehlende Angaben, passende zulässige Fakten, Grafikbezug, Versionen und Fortschritt. Der Agent bekommt nicht den gesamten Fall und darf weder selbst bestätigen noch Fachreview/Vertrag auslösen. Die aktuelle Payload-Policy autorisiert keine externe Modellübertragung.

Beispiel eines Vorschlags für ein ausdrücklich bestätigbares **jährliches Netto** von CHF 84’000:

```json
{
  "messageId": "voice_income_01",
  "path": "financial.persons.0.income.value",
  "value": 8400000,
  "expectedProfileVersion": 1
}
```

Der Betrag muss zur vorhandenen Periode und Steuerbasis passen. Unklarer Monats-/Jahres- oder Brutto-/Nettobezug erzeugt eine Rückfrage. Die akzeptierten Pfade sind serverseitig begrenzt: Einkommen, Ausgabenwerte, ausgewählte Versicherungsbedarfs-/Spielraum-/Schutzdauerfelder und ausgewählte Zielwerte bzw. `goals_add`. Beliebige JSON-Pointer sind nicht erlaubt.

Nach Vorschlagserstellung lädt Luca die aktuelle Revision, lässt den Kunden akzeptieren und bestätigt anschliessend den Gesamtstand erneut. Erst danach wird neu gerechnet. Eine Zusage im Transkript oder `confirmed=true` aus einem Modell überspringt keinen Schritt.

`AgentReplySchema` bindet Antwort/Turn und gegebenenfalls finanzielle Angaben an Run, Profil, Szenario, Eingabehash und `factRefs`. Fachbeträge müssen aus dem aktuellen freigegebenen Kontext stammen. Ein Schema prüft Referenzstruktur, nicht die Wahrheit eines frei generierten Textes; Earnies Grounding und Darios Zahlenprüfung bleiben erforderlich. Stabile Quellenreferenzen können auf den konkreten gespeicherten Run und die Kennzahl verweisen; für ausgewählte Grafiken kommen die freigegebenen `selectedGraphFacts.sourceRefs` hinzu.

### Dario – Voice

`VoiceLogSchema` akzeptiert ein finales Transkript mit `schemaVersion`, Fall-/Turn-/Nachrichtenreferenzen, kanonischer Locale `de|fr|it|en` und ausdrücklicher Klassifikation `synthetic`. Regionale Sprachcodes wie `de-CH` gehören an den Speech-Anbieter-Adapter. Roh-Audio ist kein Feld des gemeinsamen VoiceLog.

Dario und Earnie verwenden denselben sichtbaren Antworttext. Während oder vor Ausgabe werden Kontext-/Run-/Profilreferenzen verglichen. Eine veraltete finanzielle Erklärung wird nicht weitergesprochen. VoiceLog → Earnie und AgentReply → Dario sind gemeinsame Nachrichtenschemas; Aufnahme, Modellroute, STT/TTS und ihr tatsächlicher Transport liegen bei den beiden Rollen.

### Lukas – Avatar

`WholeLifeProgressSchema` ist `AdvisorContext.progress`: Prozentwert und erledigte Pflichtgruppen plus getrenntes `reviewOpen`. Der Ring misst Datenaufnahme und keinen Versicherungs- oder Risikoscore. `VoicePlaybackEventSchema` enthält `turnId`, `replyId`, `playbackId` und `started|ended|cancelled|error`; `started` wird erst beim realen Audiostart ausgelöst. Alte Playback-IDs nach Stop/Turnwechsel ignorieren. Der gemeinsame Typ erzeugt selbst keine Audio- oder Animationsereignisse.

### Valentin – Fach-/Fallservice

Die Anwendung validiert Eingaben, Besitz und Revision, verwaltet bestätigte Profile, berechnet, speichert und validiert die Ausgabe gegen dieselben Shared-Schemas. `LifeRun.inputHash` umfasst die vollständige Lebensversicherungs-/Szenariogrundlage. `run.local.calculationInputHash` ist der separate Hash des finanziellen Rechenkerns. Im Agent-Kontext entspricht `calculationInputHash` dem vollständigen **`run.inputHash`**; beide verschiedenen Hasharten dürfen nicht gleichgesetzt werden. Die Clients berechnen keinen eigenen Fachhash.

## 6. Dynamisch nachladen: SSE und Versionen

Das SSE-Ereignis heisst `advisor.context.updated`. `JSON.parse(event.data)` wird mit `AdvisorContextUpdatedSchema` validiert, danach wird `/advisor/context` neu gelesen. Die Event-Nutzlast enthält Referenzen, keine vollständigen Finanzprofile. Beim Reconnect wird der aktuelle Snapshot geliefert; eine lückenlose Ereigniswiederholung ist nicht zugesichert.

Browser-EventSource verwendet den berechtigten Same-Origin-Kunden-Cookie. Ein standardmässiger Browser-EventSource kann keinen eigenen Authorization-Header setzen; Earnies Server verwendet einen SSE-fähigen Request mit Bearer-Header. Zugangstoken gehören niemals in die URL.

| Änderung | Verhalten |
|---|---|
| Einkommen / Kosten / Ziele / Versicherungsparameter | Entwurf ungültig für neue Beratung, aktive Auswahl wird zurückgesetzt, Bestätigung und Berechnung erforderlich |
| Andere Szenariovariante / Grafikstelle | Passende Run-/GraphContext-Referenzen übernehmen; alte Erklärung bei Inkompatibilität verwerfen |
| Sprache oder Gesprächsdauer | Kontext neu lesen; bestehende fachliche Beträge und Eingabehash bleiben erhalten |
| Neues Schätzergebnis / Vorschlag | Vor nächstem Turn Kontext aktualisieren; keine automatische Kundenbestätigung |
| Abmeldung / Ablauf | SSE endet; erneute Berechtigung nötig |

`caseRevision` schützt Schreibbefehle, `profileVersion + scenarioVersionId + runId + inputHash` binden Finanzzahlen und `contextRevision/turnId/contextId` binden die aktuelle Erklärung. Diese Zähler sind nicht austauschbar.

## 7. Fehler und Team-Abnahme

`ApiErrorSchema` enthält stabilen `code`, gegebenenfalls `fields`, `locale` und übersetzte `message`. 400: ungültige Eingabe; 401: Sitzung; 403: Rolle/CSRF; 404: unbekannter oder nicht berechtigter Fall; 409: Versions-/Workflowkonflikt; 422: fachliche Angaben fehlen; Providerprobleme bleiben sichtbar. Bei 409 aktuellen Fall laden, Änderungen erneut gezielt bestätigen lassen und nicht blind den gesamten alten JSON-Stand zurückschreiben.

Erster gemeinsamer Nachweis: neuer synthetischer Kunde → Voice-/Texteingabe → Vorschlag → UI-Bestätigung → neue Berechnung → passende Grafik und gesprochene Erklärung → Fortschrittsring. Anschliessend Szenario-/Sprachwechsel, bewusst veralteter Rücklauf und gespeicherter Demo-Vertragsweg bis ins Portal zeigen. Die vollständige API-/Fachsuite und eine Browser-Typecheck-Prüfung laufen bereits; die Team-Implementierung von UI, Modellroute, Audio und Avatar wird dadurch nicht vorweggenommen.

Aktuell: 121 automatisierte Tests bestanden. Die Shared-Verträge prüfen zusätzlich fachliche Querverweise, private Feldabgrenzung, parallele Falländerungen und identische Kunden-/Fachpersonenwerte. Echte Versicherungsannahme oder rechtliche Produktionsfreigabe wird nicht behauptet.
