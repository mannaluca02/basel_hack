# 02: Prüfstand und getrennte Kundenaktionen im Angular-Client anschließen

Status: resolved
Type: task
Owner: Angular-Kundenclient-Besitzer (Luca)
Blocked by: None (kann sofort beginnen)

## What to build

Der Kunde sieht einen echten aktuellen Vorschlagsprüfstand, kann das Paket annehmen oder ablehnen und bestätigt das Gesamtprofil anschließend gesondert. Vor dem aktivierten synthetischen Modellweg erscheint ein zutreffender Verarbeitungshinweis. Der Kundenclient vermittelt außerdem die bestehenden Bestätigungsrouten für Darios späteren Voice-Anschluss.

## Umfang und Zuständigkeit

Der Angular-Besitzer verantwortet Darstellung, erforderlichen HTTP-/SSE-Anschluss, Kundensitzung/CSRF sowie kundenautorisierte Aufrufe. Den bereits im Code genannten FE-20-Anschluss erweitern bzw. wiederverwenden, falls er bei Arbeitsbeginn vorliegt; kein paralleler Datenquellenadapter. Valentin verantwortet notwendige Anpassungen der gemeinsamen Backend-Verarbeitungshinweise; Earnie liefert den tatsächlichen synthetischen Adapterumfang. Keine Neuerstellung von Backend-Verträgen, Fallmutation oder Bestätigungsworkflow. Darios STT/TTS bleibt in 07/08.

## Voraussetzungen

- Vorhandene Fall-/Paket-/Bestätigungsrouten und aktuelle gemeinsame Schemas; für unabhängigen Beginn ein durch den vorhandenen Backend-Workflow erzeugtes synthetisches Paket verwenden. 01 ist deshalb kein Blocker.
- Der aktuelle Angular-Modus `api` ist noch nicht implementiert; ein Mock gilt nicht als Live-Anschluss. Nur den für Prüfstand, Zustandsaktualisierung und Kundenaktionen nötigen Umfang anschließen, keinen vollständigen Frontend-Umbau.

## Abnahmekriterien

- [x] Ein serverseitiges Paket wird mit Person, Brutto-/Jahresbasis, Betrag und aktuellem Status angezeigt. Nach Ereignissen, Reconnect und Mutationen wird der aktuelle Fall geladen; Frontend-Mock-Verträge und lokale Voice-Antworten ersetzen die Runtime-Verträge nicht.
- [x] Der Verarbeitungshinweis nennt OpenAI, ausdrücklich erfundene Inhalte und Extraktionszweck vor dem ersten externen Aufruf. Für den aktivierten Weg widersprechen weder Kundenanzeige noch gemeinsame Backend-Hinweise diesem Ablauf; alle angebotenen Sprachen bleiben konsistent. Eine veraltete gespeicherte Hinweiszustimmung reicht nach inhaltlicher Änderung nicht aus.
- [x] Der Hinweis suggeriert weder die Freigabe realer Daten noch eine Aufhebung von `noExternalAiTransferAuthorized=true`; synthetischer Rechnertransfer und Modelltransfer bleiben unterscheidbar. Vor Erfüllung der Hinweisvoraussetzung startet der Kundenfluss keinen externen Extraktionsaufruf.
- [x] Paketannahme übernimmt nur dieses Paket in den Entwurf, bei zugehöriger Unklarheit deren Auflösung. Es entsteht dabei keine neue bestätigte Profilversion. Ablehnung übernimmt keine Werte und löst keine Unklarheit auf.
- [x] Erst eine getrennte ausdrückliche Aktion bestätigt das danach angezeigte Gesamtprofil einschließlich Annahmen und Verarbeitungshinweis; offene Unklarheiten verhindern weiterhin die Profilbestätigung.
- [x] `create`, `current/get`, `presented`, `answer` und `cancel` des vorhandenen Bestätigungsworkflows werden vom authentifizierten Kundenclient vermittelt. Dario erhält keine Kunden-Zugangsdaten; der Agent bekommt keine Bestätigungsrechte. Anzeige-Flags werden nur nach tatsächlicher Anzeige gesetzt.
- [x] Eine neue Gesprächsfrage oder ein Abbruch storniert die alte Anforderung vor dem Fortfahren. Nach Konflikt/Transportfehler wird der zentrale aktuelle Zustand geladen; eine alte Antwort wird nicht neu zugeordnet.
- [x] `VOICE_CONFIRMATION_REQUIRES_SCREEN` führt zum vorhandenen gebundenen Screen-Weg. Fehler, ausstehende Annahme und veraltete Prüfstände werden sichtbar; fehlendes `nextQuestion` bedeutet nicht automatisch ein bestätigtes Profil.
- [x] Der Pflichtfall lässt nach der ersten Annahme das Budget-Netto unverändert; eine neue bestätigte Profilversion entsteht ausschließlich nach der zweiten Kundenaktion. Prüfstand und Aktionen sind per Tastatur und zugänglich beschrifteten Steuerelementen bedienbar.

## Tests

Gezielte Angular-Tests für Hinweis vor Start, tatsächliche Anzeige, getrennte Aktionen, Ablehnung, Zustandsreload und Screen-Fallback. Einen Kunden-Durchlauf gegen den echten Fallservice nachweisen: Paket anzeigen → annehmen → neues Gesamtprofil anzeigen → separat bestätigen; zusätzlich fehlende Kundensitzung/CSRF, Konflikt und ausstehende Unklarheit. Voice-Callbacks dürfen für diese Clienttests simuliert werden und gelten noch nicht als gemeinsame Voice-Abnahme. Bestehende Backend-Autorisierungstests verwenden, nicht duplizieren.

## Answer

Umgesetzt im Angular-Client unter `code/apps/web/src/app/core/advisor/api/` und `code/apps/web/src/app/features/review/`, dazu der gemeinsame Backend-Hinweis. Betrieb und Voice-Schnittstelle: [Web-README](../../../code/apps/web/README.md).

- `dataSource: 'api'` ist angeschlossen (`ApiDataSource` über SSE, `CustomerApi`, `CustomerReview`). FE-20 lag nicht vor; es gibt keinen parallelen Adapter. Backend-Daten nutzen die Typen aus `@pax/contracts` als `import type`.
- Alle Kundenaktionen laufen über die gebundene Bestätigungskette (`create`, `current`, `presented`, `answer`, `cancel`), weil nur sie eine Ablehnung kennt. Anzeige-Flags entstehen aus den tatsächlich gerenderten Elementen.
- Hinweis: `privacy.recipients` in vier Sprachen, `PRIVACY_NOTICE`, Consent-Screen. `lifemap-synthetic-v1` ist auf `v2` angehoben; `v1` wird beim Fallstart abgewiesen und bleibt nur für gespeicherte Stände lesbar. `CONSENT_NOTICE_VERSION` ist dieselbe Version. `noExternalAiTransferAuthorized=true` bleibt unverändert.

### Nachweise

Am 31.10.2026 ausgeführt, nur synthetische Daten, kein OpenAI- oder Live-Rechner-Aufruf:

- `ng test`: 176 Tests grün, auf JSON-Ausgaben des echten Backends (`code/fixtures/voice-confirmation/`). `check:i18n`, `check:tokens` und Produktions-Build grün.
- Frischer Checkout dieses Commits (`npm ci` in `code/` und `code/apps/web`): `npm test` 164 Tests grün, einschließlich Build, Client-Typprüfung und Vertragsprüfung; `ng test` 176 grün; Produktions-Build grün. `npm ci` scheiterte dort zuerst, weil `apps/*` auch den Web-Client als Workspace erfasste, ohne dass er im Root-Lockfile steht. Der Workspace ist deshalb auf `apps/api` begrenzt.
- Im Arbeitsbaum mit den unversionierten Dateien aus 01: 179 von 180 Backend-Tests grün. Rot ist `identical redelivery…` in `tests/erni-dialog.test.mjs`. Der Test prüft die Wiederzustellung aus 05, wurde während des Laufs von außen ergänzt und gehört nicht zu diesem Ticket.
- Kunden-Durchlauf im echten Chrome gegen den echten Fallservice (`npm run demo:customer-review`, `npm run start:api`): Hinweis ohne vorherigen API-Aufruf, Anmeldung, Paket per SSE, Annahme per Tastatur (Brutto 11’900’000 Rappen, Netto 8’400’000 unverändert, weiter Version 1), neues Gesamtprofil, getrennte Bestätigung (Version 2). Ebenso Ablehnung, Fallwechsel bei offener Frage, veraltetes Paket, offene Unklarheit, fehlende Sitzung, falscher CSRF-Token, veraltete Zustimmung und Sprachwechsel.

### Bewusst offen

- Voice-Callbacks sind nur simuliert. Das ist keine gemeinsame Voice-Abnahme; sie bleibt bei 07, 08 und 11.
- `GET /customer-confirmations/:id` ist nicht angeschlossen; `current` deckt Reload und Transportfehler ab.
- Ein veraltetes Paket ohne Unklarheit erkennt der Client erst beim Öffnen, weil der Fall keinen Entwurfshash ausliefert. Die Markierung gilt bis zum Reload.
- Scheitert `presented` am Transport, bleibt die Frage unbeantwortbar, bis sie abgebrochen und neu geöffnet wird. Eine automatische Wiederholung könnte bei dauerhaftem Fehler endlos laufen.
- Der Client startet keine Extraktion. Der Hinweis aus 01 (`erni-synthetic-extraction-v1`) ist deshalb noch nicht an diesen Consent gebunden; das gehört zu 07.
- Die französischen und italienischen Hinweistexte sind nicht fachlich oder rechtlich gegengelesen.
- Der Versionssprung ändert gemeinsame Verträge. Clients auf `v1` werden abgewiesen, bis sie nachziehen. Valentins Bestätigung steht aus.

## Comments

- 31.10.2026, Valentin: Gemeinsamer Backend-Hinweis erledigt auf `feat/voice-case-integration`. Eigener Hinweis `extraction-synthetic-v1` (OpenAI, synthetische Projektion, Ausschlüsse) in DE/FR/IT/EN, hashgebundene Kundenzustimmung pro Fall, `/api/privacy` widerspricht dem aktivierten Weg nicht mehr. Earnie prüft vor Modellaufruf und Einreichung `runtime.modelExtraction.assertTransferAllowed()`. Details und Routen: [model-extraction-notice.md](../../../documentation/baselhack/plans/model-extraction-notice.md). Offen beim Angular-Besitzer: Anzeige und Zustimmungsaufruf.
