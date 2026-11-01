# 07: Finale Voice-Beiträge an Earnies gemeinsamen Dialogweg übergeben

Status: ready-for-agent
Type: task
Owner: Dario
Blocked by: 01 — Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

## What to build

Darios tatsächlicher Voice-Eingang liefert einen abgeschlossenen synthetischen Nutzerbeitrag mit rollengetrenntem Unterhaltungslog an Earnie und erhält dessen aktuellen Vorschlags- oder Rückfragenstand für den nächsten passenden Antwortturn.

## Umfang und Zuständigkeit

Dario besitzt finale STT-Übergabe, Sprecherrollen, Turn-/Nachrichtenreferenzen und Sprech-Timing; Earnie bleibt Besitzer der Extraktion. Den vorhandenen Voice-Stand anschließen, ohne dessen lokalen Fragebogen oder Antwortspeicher als verbindlichen Fall zu übernehmen. Kundenanzeige und Bestätigungsaufrufe bleiben in 02; gebundene Bestätigungswiedergabe folgt in 08. Kein allgemeiner Umbau von STT/TTS, Providerwahl oder Avatar.

## Voraussetzungen

- 01 stellt einen nutzbaren, validierenden Moduleingang bereit; derselbe aktuelle Stand von `@pax/contracts` wird verwendet.
- Bei Beginn aktuellen Voice-Branchstand prüfen. Lokale Referenz bei Zerlegung: `origin/feature/voice` auf `a00f48f`; ein Merge wird durch dieses Ticket nicht beauftragt.
- Ausschließlich eigens erfundene Testdialoge; vorhandene Voice-Beispiellogs nicht ungeprüft als synthetisch deklarieren.

## Abnahmekriterien

- [ ] Nur finale Nutzerbeiträge gehen als gültiger `VoiceLog` mit stabilen Fall-, Nachrichten-, Turn- und Quellenbezügen an Earnie. Partielle Transkripte und Roh-Audio bleiben außerhalb der Extraktion.
- [ ] Der umgebende Unterhaltungslog unterscheidet Nutzer- und KI-Rollen; diese werden nicht als ungeprüfte Zusatzfelder in den strikten `VoiceLog` eingebaut.
- [ ] Eine tatsächliche finale Äußerung zum Pflichtfall führt über Earnies Modul zu genau einem unbestätigten Jahresbrutto-Paket; lokale `captured`-Antworten gelten nicht als bestätigte Fallangaben und schreiben keinen eigenen Fallstand.
- [ ] Die nächste inhaltliche Antwort wartet auf den verarbeiteten Turn und prüft ihren Zustandsbezug vor Wiedergabe. Eine Rückfrage wird im nächsten passenden Antwortturn gestellt; laufende Nutzerrede wird durch normale Aufnahme nicht unterbrochen.
- [ ] Verarbeitungsfehler werden sichtbar und ermöglichen Wiederholung mit erhaltenen Identitäten. Es wird weder ein alter Stand als frische Antwort gesprochen noch ein neues Modellresultat desselben Turns ungeprüft erneut eingereicht.
- [ ] Der bestehende Übergabestopp und erhöhte Übergaberevision stoppen Darios laufendes TTS/STT und verwerfen alte Transkripte/Antworten auch nach schnellem Resume. Keine eigenständige Kundenaktion oder zusätzliche Bestätigungsrechte.

## Tests

Adaptertests mit finalen und partiellen STT-Ereignissen, Rollenwechseln, doppelter Zustellung, verzögerter Extraktion und Übergabestopp. Einen angeschlossenen synthetischen Turn gegen Earnies tatsächliches Modul und den echten Fallservice mit simuliertem Modelltransport nachweisen. Das belegt den Datenanschluss; echte STT/TTS-Callbacks und zwei Kundenbestätigungen werden erst in 11 gemeinsam abgenommen.

## Comments
