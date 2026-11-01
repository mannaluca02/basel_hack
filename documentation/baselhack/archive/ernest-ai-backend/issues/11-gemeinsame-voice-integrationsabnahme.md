# 11: Gemeinsamen Voice-Weg mit zwei getrennten Bestätigungen abnehmen

Status: ready-for-human
Type: task
Owner: Dario (gemeinsame Abnahme mit Earnie und Angular-Kundenclient-Besitzer)
Blocked by: 08 — Voice-Frage, tatsächliches Playback und neue Antwort eindeutig binden; 10 — Synthetische Extraktionsqualität mit echtem OpenAI separat abnehmen

## What to build

Das Team weist den vollständigen gemeinsamen synthetischen Gesprächsweg mit tatsächlicher finaler Voice-Übergabe, Earnies Modell-/Tool-Weg, Kundenanzeige, echter Wiedergabe und zwei getrennten Kundenbestätigungen nach. Das Ticket ist wegen der gemeinsamen realen Voice-/Anzeigeabnahme `ready-for-human`.

## Umfang und Zuständigkeit

Dario führt die Voice-Abnahme und verantwortet reale STT/TTS-/Frage-/Antwortbindung. Earnie verantwortet echte Extraktion und Orchestrierung; der Angular-Besitzer verantwortet tatsächliche Anzeige und kundenautorisierte Aufrufe. Valentin unterstützt bei gemeinsamen Vertrags-/Berechtigungs-/Fallservicefehlern; vorhandene Backend-Grundlagen werden nicht erneut entwickelt. Keine Telefonie, Veröffentlichung oder produktive Inbetriebnahme.

## Voraussetzungen

- 08 liefert den angeschlossenen Voice-Bestätigungsweg; 10 den gesonderten echten OpenAI-Nachweis. Die übrigen Modulfälle und Kundenanschlüsse sind darüber bereits Voraussetzungen.
- Alle Teilnehmer bauen denselben aktuellen Stand von `@pax/contracts`; vorbereiteter synthetischer Fall, sichtbarer korrekter Verarbeitungshinweis und echte Playback-/STT-Callbacks stehen bereit.

## Abnahmekriterien

- [ ] Nachgewiesene Kette: finale synthetische Äußerung → Earnies Modell-/Tool-Weg → zentrales unbestätigtes Paket → angezeigter Prüfstand → tatsächlich unverändert wiedergegebene Bestätigungsfrage → gebundene neue Antwort → Paketannahme → separat angezeigtes Gesamtprofil mit Annahmen/Hinweis → zweite Frage → zweite neue Antwort → neue bestätigte Profilversion.
- [ ] Der erste Satz zu 119’000 CHF Jahresbrutto erzeugt genau `person_demo_1` / `insurance.persons.0.grossAnnualIncomeCents` / `11900000`. Vor dem ersten Ja bleiben Entwurf und bestätigte Historie unverändert; Budget-Netto bleibt über den gesamten Ablauf unverändert.
- [ ] Nach dem ersten Ja ist ausschließlich das Paket übernommen. Eine neue bestätigte Profilversion entsteht erst nach der zweiten Antwort. Eine passende beantwortete Unklarheit wird erst bei Paketannahme aufgelöst und vorher nicht wiederholt abgefragt.
- [ ] Unterbrochene Wiedergabe und TTS-Fehler senden keine erfolgreiche Darstellung. Andere neue Gesprächsfrage/Abbruch storniert die alte Anforderung vor Fortsetzung. Falsche Bindung, allgemeines/mehrdeutiges Ja, Ablauf, verspätete oder wiederverwendete Antwort sowie Falländerung zwischen Frage und Antwort bewirken keine unbeabsichtigte Bestätigung.
- [ ] Der tatsächliche Kundenclient vermittelt die Aufrufe mit Kundensitzung; Dario und Earnie erhalten keine Kunden-Zugangsdaten. Angezeigter Prüfstand und Playback entsprechen derselben serverseitigen Frage und Basis.
- [ ] Gemeinsamer Gesprächsstopp beendet laufende Aufnahme/Wiedergabe/Extraktion. Nach schnellem Resume wird kein alter Turn weiterverwendet; Fortsetzung benötigt einen neuen Turn mit frischem Zustand.
- [ ] Soweit eine anschließende Berechnung Bestandteil des gemeinsamen Durchlaufs ist, verwendet sie den vorhandenen synthetischen Testprovider und genau die neue bestätigte Profilversion, keinen Live-Rechner.
- [ ] Beteiligte, geprüfte Commits/Vertragsstand, tatsächliche Callbacks, Fallausgänge und verbleibende Fehler werden dokumentiert. Simulierte Backend-Demos, Testfixtures oder lokaler Voice-Status gelten nicht als Ersatz; fehlende Anschlüsse lassen die Abnahme ausstehend.

## Tests und Durchführung

Einen echten positiven Durchlauf und die genannten negativen Voice-/Zustandsfälle gemeinsam am Kundenclient durchführen. Für Ablauf- und Fehlerfälle darf die Störung gezielt ausgelöst werden; Wiedergabe-/Anzeigeereignisse dürfen nicht vorweggenommen werden. Bestehende Extraktions-/Voice-Demos dienen nur als Referenz. Nach relevanten Änderungen die Modul-/Backend-Gates sowie Angular-Build, relevante Clienttests und i18n-Prüfung ausführen; bereits grüne unveränderte Bereiche nicht grundlos erneut testen.

## Comments
