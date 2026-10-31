# Gemeinsamer Schalter für persönliche Beratung

Stand: 31.10.2026. Backend, gemeinsame Verträge, Stoppsignal und Beispiel-Clients sind implementiert. Entsprechend der Absprache liefert der Backendteil ausschließlich Kontaktdaten; es gibt keine Anwahl, keinen `tel:`-Redirect und keine Telefonieintegration. Den sichtbaren Schalter und die tatsächlichen Audio-/Avatar-/Modellmodule schließen deren Besitzer an.

## Zustand und Auslöser

Alle Teams verwenden `HumanHandoverSchema` aus `@pax/contracts`. Derselbe verschlüsselt gespeicherte Zustand liegt unter `InsuranceCaseDto.handover`, `AdvisorContext.handover`, `ExtractorContext.handover` und `AdvisorContextUpdated.handover` im bestehenden SSE-Kanal.

```json
{
  "status": "requested",
  "revision": 1,
  "wantsHumanAdvisor": true,
  "leaveViewRequested": true,
  "stopDigitalConversation": true,
  "requestId": "<serverseitige ID>",
  "requestedAt": "<Zeitpunkt>",
  "resumedAt": null,
  "source": "ui"
}
```

`wantsHumanAdvisor` ist der gemeinsame Schalter. Die weiteren Flags benennen die Wirkung auf View und Gespräch. Der Server prüft, dass die Flags zum Status passen. Die eigene Übergaberevision steigt sowohl bei Anforderung als auch bei Wiederaufnahme.

Auslöser ist die ausdrückliche Kundenaktion „Mit einem Berater sprechen“ oder ein entsprechender eindeutiger Sprachwunsch. Ein Wechsel zwischen Grafiken, Risiken, Chat und Info, `visibilitychange`, das Schließen des Fensters oder ein Verbindungsabbruch ist keine automatische Übergabe.

## Schnittstellen

- `GET /api/cases/:caseId/handover`: aktueller Zustand und Kontaktdaten; autorisierter Kunde, fallbezogener Agent oder Reviewer mit Fallzugriff.
- `POST /api/cases/:caseId/handover`: nur die Kundensitzung darf anfordern oder wieder aufnehmen. Cookie-Zugriffe benötigen CSRF; ein Agent darf keinen Kundenwunsch erfinden oder zurücksetzen.

```json
{
  "action": "request",
  "messageId": "handover_request_01",
  "expectedCaseRevision": 12,
  "source": "ui"
}
```

Für den vermittelten Sprachwunsch ist `source=voice` möglich, weiterhin über den Kundenclient. Das bestätigt keine Finanzangaben und keinen Versicherungsvertrag. Intern verwendet ein Nest-Modul `runtime.handover.command(customerActor, caseId, input)` und `runtime.handover.read(authorizedActor, caseId)`.

Die Antwort ist `HumanHandoverCommandResponseSchema`: `caseId`, `caseRevision`, `contextRevision`, `handover`, `contact`, sowie `command` mit `messageId`, `action`, `changed` und `replayed`. [Typisierter Browser-Aufruf und Stop-Handler](../../../code/examples/contracts/team-client.ts).

Zur Wiederaufnahme sendet der Kunde `action=resume` mit neuer Nachrichten-ID und aktueller Fallrevision. Die Flags werden `false`, Status `digital`, und `resumedAt` wird gesetzt. Offene menschliche Review-Aufgaben bleiben offen. Es folgt ein neuer Gesprächszug mit frisch geladenem Kontext; alte Voice-/Modellantworten werden nicht fortgesetzt.

Identische Nachrichten-ID und identische Aktion/Quelle sind idempotent. Ein Retry liefert den **aktuellen** Zustand und aktiviert deshalb nach einem späteren Resume nicht versehentlich den alten Wunsch erneut. Andere Inhalte bei gleicher ID führen zu `IDEMPOTENCY_CONFLICT`; neue Befehle mit veralteter Revision zu `VERSION_CONFLICT`. Wiederholte Requests bei bereits aktivem Zustand erzeugen keine doppelten Ereignisse oder Review-Aufgaben.

## Signal und Aufgaben der Module

Das bestehende Event `advisor.context.updated` enthält den Übergabezustand. Bei aktiver Übergabe oder einer seit dem letzten Snapshot erhöhten Übergaberevision ist `interruptPolicy=immediate`. Ein Reconnect liefert den aktuellen Zustand ebenfalls. Der SSE-Kanal bleibt offen, damit eine Wiederaufnahme ankommt.

```ts
let lastHandoverRevision = 0;
function onContextUpdated(event: AdvisorContextUpdated) {
  const switched = event.handover.revision > lastHandoverRevision;
  if (event.handover.stopDigitalConversation || switched) {
    stopCurrentDigitalTurn();
  }
  lastHandoverRevision = event.handover.revision;
  reloadAuthorizedContext();
}
```

Die Revision ist auch bei schnellem `request → resume` maßgeblich: Ein langsamer Client sieht möglicherweise nur den wieder digitalen Zustand, muss aber den alten Turn beenden. Backend-Polling liegt bei ungefähr 250 ms, zusätzlich zu Verbindungs- und Clientlaufzeiten.

| Besitzer | Reaktion |
|---|---|
| Luca | Digitalen View verlassen, Kontaktansicht zeigen und Serverzustand anzeigen. Sichtbarer Schalter/Navigation gehören zum Angular-Modul. |
| Dario | TTS und Mikrofon/STT abbrechen; alte Transkripte und Bestätigungen verwerfen. |
| Erni | Modell-/Tool-Orchestrierung abbrechen, späte Ausgaben verwerfen, keine weiteren Extraktionsvorschläge erzeugen. |
| Lukas | Sprech-/Listening-Animation beenden und einen passenden Ruhezustand anzeigen. |
| Valentin | Zustand speichern, prüfen und signalisieren; Review-Aufgabe anlegen und lokale Rechneranfragen abbrechen. |

Jedes echte Modul muss das Ereignis abonnieren und seinen eigenen tatsächlichen Abbruch ausführen. Das Feld stoppt nicht von selbst andere Prozesse/Geräte. Backend und generischer `handleDigitalStop()`-Handler sind vorhanden. Es werden keine Slack-/E-Mail-Nachrichten versendet.

## Verhalten während der Übergabe

Neue digitale Kundenmutationen für Entwurf, Bestätigung, Rechnung/Szenarien, Vorschlagsannahme und Demo-Vertragsweg sind mit `HUMAN_HANDOVER_ACTIVE` gesperrt. Agent-Vorschläge ebenfalls. Der Agent bekommt nur `read_context`, keine Folgefrage und keine zum Sprechen freigegebenen Rechenbeträge. Bestehende sprachliche Bestätigungen werden invalidiert.

Laufende Analyse-, Schätz-, Zusatzrechner- und Ortssuchanfragen erhalten ein lokales AbortSignal. Schon übertragene Providerdaten werden dadurch nicht zurückgeholt. Ein Provider, der das Signal ignoriert und später antwortet, darf trotzdem keine veralteten Ergebnisse aktivieren. Abgebrochene digitale Tasks liefern `DIGITAL_TASK_CANCELLED`; laufende Analysemarker werden bereinigt. Die neue Übergabe setzt außerdem die Grafikauswahl zurück.

Bestätigte Profile und gespeicherte Ergebnisse bleiben erhalten. Autorisiertes Lesen, Kunden-Löschung, Feedback, Sprach-/Dauerpräferenzen, Übergabeaktionen und berechtigte fachliche Review bleiben möglich. Eine Sprachänderung setzt den Schalter nicht zurück. Eine Review-Aufgabe wird bei Bedarf angelegt und macht den Fall im bestehenden Reviewer-Zugriff sichtbar; sie weist noch keinen echten Berater zu.

Zustandswechsel werden auditiert. Falllöschung und Ablauf gelten auch für diese Daten. Alte verschlüsselte Fälle erhalten beim Öffnen den Standard `digital` mit Flags `false`. Die Reviewer-Insights zählen aktuelle Wünsche unter `humanHandover.requested`, keine Telefonverbindungen.

## Kontaktdaten ohne Anwahl

Das Kontaktobjekt liefert **+41 61 277 66 66**, als Datenwert `+41612776666`, mit Quelle und Prüftag. Es ist der allgemeine öffentliche Pax-Kontakt, keine behauptete direkte Beraterverbindung. [Offizielle Pax-Kontaktseite](https://www.pax.ch/de/kontakt-und-services).

`contact.automaticDialing=false` und `contact.advisorAssigned=false` gehören ausdrücklich zum Vertrag. Eine spätere Anrufaktion, Terminbuchung oder Fallübermittlung ist ein eigener Integrationsschritt und wird nicht als bereits erfolgt ausgegeben. Der Backendteil baut keine Telefonverbindung auf.

## Testen und Beispiele

Im `code`-Workspace:

```sh
npm test
npm run demo:handover
```

Die Demo erzeugt einen temporären synthetischen Fall, fordert die Übergabe an, liest den Zustand in beiden Agent-Kontexten, prüft den Stop-Vertrag, wiederholt denselben Befehl und nimmt ausdrücklich wieder auf. Es gibt dabei keine Rechner-, Modell- oder Telefonieaufrufe.

`npm run contracts:handover-examples` erzeugt sieben zusammengehörige Offline-JSONs unter [fixtures/human-handover](../../../code/fixtures/human-handover/). [Gemeinsame Schemas](../../../code/packages/contracts/src/human-handover.ts), [Service](../../../code/apps/api/src/insurance/human-handover.ts) und [Tests](../../../code/tests/human-handover.test.mjs).

Die Tests prüfen außerdem Rollen/CSRF, Revisionen, verspätete Rechenantworten auch nach schnellem Resume, Reconnect/SSE, Migration, Bestätigungsinvalidierung und Löschung. Alle Teams müssen denselben aktuellen Stand von `@pax/contracts` verwenden; der Eventvertrag kennt jetzt `interruptPolicy=immediate`. Der vorhandene Frontend-Mock-/API-Adapter ist in diesem Backend-Auftrag nicht umgebaut.
