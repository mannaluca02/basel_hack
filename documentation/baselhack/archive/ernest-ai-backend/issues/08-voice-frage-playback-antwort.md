# 08: Voice-Frage, tatsächliches Playback und neue Antwort eindeutig binden

Status: ready-for-agent
Type: task
Owner: Dario
Blocked by: 02 — Prüfstand und getrennte Kundenaktionen im Angular-Client anschließen; 07 — Finale Voice-Beiträge an Earnies gemeinsamen Dialogweg übergeben

## What to build

Der Kunde hört genau die serverseitige Bestätigungsfrage zum angezeigten Prüfstand und beantwortet sie mit einem neuen finalen Beitrag. Das erste passende Ja übernimmt nur das Paket; das Gesamtprofil erfordert eine zweite Frage und eine zweite Antwort.

## Umfang und Zuständigkeit

Dario verantwortet Frage-/Turn-/Reply-Zuordnung, exakten TTS-Text und tatsächliche Playback-/STT-Ereignisse. Der Angular-Besitzer vermittelt alle Bestätigungsrouten und Anzeigeereignisse mit seiner Kundensitzung. Valentin besitzt den bestehenden serverseitigen Bestätigungsworkflow; Earnie erhält weder Kunden-Zugangsdaten noch Bestätigungsrechte. Keine zweite Bestätigungslogik im Modell oder Voice-Antwortspeicher.

## Voraussetzungen

- 02 liefert Anzeige und kundenautorisierte Bestätigungsaufrufe; 07 liefert den angeschlossenen finalen Voice-Weg.
- Vorhandene `CustomerConfirmationSchema`-/Antwort-/Playback-Verträge und die kurze serverseitige Ablaufzeit unverändert verwenden. Für Anschlussprüfungen reicht ein über den echten Fallservice vorbereitetes Paket; 03–06 sind keine zusätzlichen Coding-Blocker.

## Abnahmekriterien

- [ ] Der Kundenclient erstellt für genau `accept_batch` oder `confirm_profile` eine Anforderung auf aktueller Basis. Dario spricht den serverseitigen Fragetext unverändert; `questionId`, Fragehash sowie Frage-Turn-/Reply-Referenzen bleiben erhalten.
- [ ] Erst nach tatsächlich angezeigtem Prüfstand und echtem TTS-`ended` mit tatsächlicher Playback-ID darf der Kundenclient `presented` melden. Abbruch, Unterbrechung, `started` und TTS-Fehler gelten nicht als vollständig wiedergegeben.
- [ ] Bereits beim Erzeugen der finalen Antwort wird `VoiceLog.correlationId` der aktuellen `questionId` zugeordnet. Ein früheres oder allgemeines Ja wird niemals nachträglich umetikettiert.
- [ ] Das erste passende Ja nimmt genau das Paket an. Vor einer separaten `confirm_profile`-Anforderung werden Gesamtprofil, Annahmen und Hinweis angezeigt; dafür entstehen neue Frage-Turn-/Reply-IDs und ein neuer Antwortbeitrag. Dieselbe Antwort kann nicht beide Aktionen autorisieren.
- [ ] Ein gebundenes Nein nutzt den Kundenworkflow: Paketstatus `rejected`, keine Entwurfsänderung und keine Auflösung offener Unklarheiten. Earnies Extraktion deutet es nicht als neuen Betrag.
- [ ] Vor einer anderen neuen Gesprächsfrage oder bei Abbruch meldet der Kundenclient den vorhandenen Cancel-Schritt. Falländerung, Ablauf, neue Bestätigungsfrage und Übergabe machen alte Bindungen unbrauchbar; nach Antwortverlust wird der aktuelle zentrale Zustand geladen.
- [ ] Mehrdeutige, fremde, ungebundene, verspätete und wiederverwendete Antworten lösen keine Bestätigung aus. Nicht unterstützte Voice-Änderungen verwenden den gebundenen Screen-Weg, keine erfundene Zusammenfassung.

## Tests

Anschlussprüfungen mit echtem Bestätigungsservice und kontrollierten Playback-/STT-Ereignissen: zwei getrennte Ja, gebundenes Nein, unterbrochenes Playback, TTS-Fehler, andere neue Frage mit Cancel, falsche Bindung, allgemeines/mehrdeutiges Ja, Ablauf, verspätete Antwort, wiederverwendete Antwort und Falländerung zwischen Frage und Antwort. `presented` darf vor `ended` nicht gesendet werden. Bestehende Backend-Tests sind Vorbilder; simulierte Callbacks ersetzen die gemeinsame echte Voice-Abnahme 11 nicht.

## Comments
