# 02: Prüfstand und getrennte Kundenaktionen im Angular-Client anschließen

Status: ready-for-agent
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

- [ ] Ein serverseitiges Paket wird mit Person, Brutto-/Jahresbasis, Betrag und aktuellem Status angezeigt. Nach Ereignissen, Reconnect und Mutationen wird der aktuelle Fall geladen; Frontend-Mock-Verträge und lokale Voice-Antworten ersetzen die Runtime-Verträge nicht.
- [ ] Der Verarbeitungshinweis nennt OpenAI, ausdrücklich erfundene Inhalte und Extraktionszweck vor dem ersten externen Aufruf. Für den aktivierten Weg widersprechen weder Kundenanzeige noch gemeinsame Backend-Hinweise diesem Ablauf; alle angebotenen Sprachen bleiben konsistent. Eine veraltete gespeicherte Hinweiszustimmung reicht nach inhaltlicher Änderung nicht aus.
- [ ] Der Hinweis suggeriert weder die Freigabe realer Daten noch eine Aufhebung von `noExternalAiTransferAuthorized=true`; synthetischer Rechnertransfer und Modelltransfer bleiben unterscheidbar. Vor Erfüllung der Hinweisvoraussetzung startet der Kundenfluss keinen externen Extraktionsaufruf.
- [ ] Paketannahme übernimmt nur dieses Paket in den Entwurf, bei zugehöriger Unklarheit deren Auflösung. Es entsteht dabei keine neue bestätigte Profilversion. Ablehnung übernimmt keine Werte und löst keine Unklarheit auf.
- [ ] Erst eine getrennte ausdrückliche Aktion bestätigt das danach angezeigte Gesamtprofil einschließlich Annahmen und Verarbeitungshinweis; offene Unklarheiten verhindern weiterhin die Profilbestätigung.
- [ ] `create`, `current/get`, `presented`, `answer` und `cancel` des vorhandenen Bestätigungsworkflows werden vom authentifizierten Kundenclient vermittelt. Dario erhält keine Kunden-Zugangsdaten; der Agent bekommt keine Bestätigungsrechte. Anzeige-Flags werden nur nach tatsächlicher Anzeige gesetzt.
- [ ] Eine neue Gesprächsfrage oder ein Abbruch storniert die alte Anforderung vor dem Fortfahren. Nach Konflikt/Transportfehler wird der zentrale aktuelle Zustand geladen; eine alte Antwort wird nicht neu zugeordnet.
- [ ] `VOICE_CONFIRMATION_REQUIRES_SCREEN` führt zum vorhandenen gebundenen Screen-Weg. Fehler, ausstehende Annahme und veraltete Prüfstände werden sichtbar; fehlendes `nextQuestion` bedeutet nicht automatisch ein bestätigtes Profil.
- [ ] Der Pflichtfall lässt nach der ersten Annahme das Budget-Netto unverändert; eine neue bestätigte Profilversion entsteht ausschließlich nach der zweiten Kundenaktion. Prüfstand und Aktionen sind per Tastatur und zugänglich beschrifteten Steuerelementen bedienbar.

## Tests

Gezielte Angular-Tests für Hinweis vor Start, tatsächliche Anzeige, getrennte Aktionen, Ablehnung, Zustandsreload und Screen-Fallback. Einen Kunden-Durchlauf gegen den echten Fallservice nachweisen: Paket anzeigen → annehmen → neues Gesamtprofil anzeigen → separat bestätigen; zusätzlich fehlende Kundensitzung/CSRF, Konflikt und ausstehende Unklarheit. Voice-Callbacks dürfen für diese Clienttests simuliert werden und gelten noch nicht als gemeinsame Voice-Abnahme. Bestehende Backend-Autorisierungstests verwenden, nicht duplizieren.

## Comments
