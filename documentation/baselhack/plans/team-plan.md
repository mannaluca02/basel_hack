# Pax LifeMap – bestätigte Aufgabenverteilung nach dem Workshop

Stand: 31.10.2026. Quelle: Whiteboard-Foto und ausdrückliche Nutzerbestätigung. UI/Features und Zuständigkeiten sind definiert; die App-Implementierung ist damit nicht nachgewiesen.

Der [Detailplan](implementation-plan.md) erklärt die Umsetzung, die [Workshop-Entscheide](workshop-decisions.md) trennen Quelle und Interpretation und das [neue Backlog](implementation-backlog.md) enthält die konkreten Arbeitspakete. Angular bleibt gesetzt.

## Bestätigte fünf Bereiche

| Name | Bereich | Ergebnis | Wichtigste Übergabe |
|---|---|---|---|
| Luca | UI | Dynamic View und Tabs Progress / Graphics / Chat / Info / Summary | Ein gemeinsamer Fall-/Grafikkontext, Agent-Slot und erreichbare Voice-Steuerung |
| Lukas | Avatar | Einfacher Agent mit Fortschrittsring und technischen Zuständen | Listening/Thinking/Speaking aus echten Ereignissen; Video erst optional |
| Dario | Voice | Freigegebener STT-/TTS-Pfad mit Transkriptkorrektur und Stop | Derselbe Advisor-Turn wie Text; keine ungeklärte Audio-Cloud |
| Valentin | Logik-Backend | Drei Säulen, Budget, drei Szenarien, GraphContext und fachliche Statusregeln | Versionierte Ergebnisse und nachvollziehbare Fachgrenzen |
| Earnie | KI-Backend | Zeitbudget-Dialog, Feldvorschläge, Rückfragen, Grafik-Erklärung und Summary | Gemeinsamer gespeicherter Fall, Modell-/Toolgrenzen und zwei Summary-Sichten |

Die durchgestrichene frühere UI-Zuordnung an Earnie wird nicht weitergeführt. Für gemeinsame Backend-Basis/Session/Persistenz ist Earnie vorgesehen, für fachliche Rechen-/Journeyregeln Valentin. Das ist ein Umsetzungsvorschlag, kein aus dem Foto abgeleiteter Beschluss für zwei Server. Sicherheit und Abnahme liegen gemeinsam beim Team; Luca verantwortet die UI-Gesamtabnahme.

## Gemeinsame Produktentscheidungen

1. Grafikzentrierte Dynamic View statt eigenständiger Chat-Hauptapp.
2. Fünf primäre Ansichten und dauerhaft erreichbarer Agent mit Fortschritt; der Ring ist kein Risiko-Score.
3. Einstieg nach verfügbarer Zeit; Tempo/Erklärlänge passt sich an, Pflichtprüfung nicht.
4. Dynamische Grafiken mit expliziter Auswahl von Person, Szenario und Zeitraum.
5. Agent erklärt eine konkrete Stelle aus demselben Rechenlauf; Text und freigegebene Audioausgabe bleiben konsistent.
6. Summary für Kunde/interessierte Person und Fachperson aus einem Snapshot; Export ist kein automatischer Versand.
7. Video-Avatar ausdrücklich Nice-to-have. Follow-up/Overview vorläufig Erweiterung; Dark Mode nur aus dem Mondsymbol abgeleitet.

## Sofort gemeinsam festlegen

`CaseSnapshot`, `InteractionPreference`, `GraphContext`, `AgentPresentation`, `VoiceTurn` und `SummaryBundle`. Geld-/Zeit-/Quellenstatus und Profil-/Szenarioversion gehören zum Vertrag. Jeder Tab und jeder Kanal nutzt ihn. Der erste Testfall bleibt die vollständig erfundene Familie TEST Nina / TEST Tom; Ergänzungen und Originalreferenzen bleiben getrennt.

## Workflow aus dem zweiten Foto

Nutzer ↔ Dario → Earnie (VoiceLog) → strukturierter Fallstand ↔ Valentin → Luca (Result). Die passende Antwort geht über Earnie/Dario zurück zum Nutzer; Dario meldet reale Playback-Ereignisse an Lukas. Der Agentprogress kommt getrennt aus der Datenreife. Details, Versionsschutz und synthetische Beispiele stehen in den [zehn Schnittstellenverträgen](interface-contracts.md). Der gemeinsame JSON-Fallstand ist bestätigt; Speichertechnik bleibt offen. I10 versorgt Dario mit aktuellem Gesprächskontext. HTTP/SSE ist der P0-Vorschlag; siehe [dynamische Voice-Anbindung](interface-contracts.md#9-gemeinsame-json-und-dynamischer-gesprächskontext-für-dario).

## Integrationsfolge

| Gate | Gemeinsamer Funktionsnachweis |
|---|---|
| M0 | Angular-Shell, Agentvertrag, Speech-/Modellweg und Fachschema abgestimmt |
| M1 | Gespeicherter Fall, Feldvorschlag, Baseline und korrekter Fortschritt |
| M2 | Fünf Tabs, einfacher Agent, Voice und Grafik verbunden |
| M3 | Familie, Eigenheim und Pensionierung plus ausgewählte Grafik-Erklärung |
| M4 | Kunden-/Fachperson-Summary und gespeicherter Demo-Antrags-/Policenweg |
| M5 | Negative Audio-/Avatar-/Sicherheitsfälle und komplette wiederholbare Demo |

Die bisherige 48-Stunden-Annahme ist ein Gesamtfenster, keine neue Restzeit ab dem Workshop. Vor weiterem Baustart echte Abgabezeit und vorhandene Zwischenstände abgleichen.

## Erste Arbeit je Owner

### Luca – UI

- [ ] Pax-UI-/Angular-Kompatibilität prüfen und fünf Tabs auf einer Fallquelle aufbauen.
- [ ] Zeitbudget und bestätigbare Datenkarten in den Workspace integrieren.
- [ ] Zeitgrafik, drei Szenariokarten und „Diese Stelle erklären“ verbinden.
- [ ] Chat/Info und beide Summary-Sichten ohne widersprüchliche Werte anzeigen.
- [ ] Schmale Ansicht, Tastatur und Demo-Journey gemeinsam testen.

### Lukas – Avatar

- [ ] Agent-Host und Darstellungs-Events definieren.
- [ ] Fortschrittsring und Text mit Datenreife-/Reviewgrenze verbinden.
- [ ] Idle/Listening/Thinking/Speaking/Error aus echten Vorgängen zeigen.
- [ ] Stop, verspätete Events und nicht verfügbares Video sauber behandeln.
- [ ] Video-Avatar erst nach funktionierendem Grundpfad ergänzen.

### Dario – Voice

- [ ] Freigegebenen Speech-Weg und Demo-Browser prüfen; Mikrofon erst nach Nutzeraktion.
- [ ] Push-to-talk, Transkriptkorrektur und Bestätigung vor Feldänderung verbinden.
- [ ] Zahlengetreue Sprachausgabe mit Stop/Mute implementieren.
- [ ] P0 ohne paralleles Mithören des eigenen TTS; Turn-Abbruch mit Lukas abstimmen.
- [ ] Permission denied, fehlendes Gerät, Providerfehler und Textfallback testen.

### Valentin – Logik-Backend

- [ ] Einheiten, Quellenstatus, GraphContext und Fortschrittsgruppen mit Earnie vereinbaren.
- [ ] Logismata-Antworten normalisieren; Risiko-Code 0 bleibt bis Klärung reviewpflichtig.
- [ ] Budget und Kapitalzuordnung sowie alle drei Szenarien umsetzen.
- [ ] Keine proportional erfundenen PK-Leistungen oder doppelten Kapitalverwendungen.
- [ ] Fachliche Demo-Journeyregeln und Quellen-/Domainfragen abnehmen.

### Earnie – KI-Backend

- [ ] Geschützten gemeinsamen Fall-/Session-/Modellpfad bereitstellen.
- [ ] Zeitbudgetabhängige Rückfragen und bestätigbare Feldvorschläge implementieren.
- [ ] Ausgewählte Grafikstelle anhand validierter Ergebnisreferenzen erklären.
- [ ] Handlungsoptionen vor Produkt und Summary-Sichten aus demselben Snapshot erzeugen.
- [ ] Rollen, Versionskonflikte, Prompt Injection, Export und Modelldatenwege prüfen.

## Aufwand und gemeinsames Review

34 P0-Tickets mit 71 Personenstunden: Luca 15, Lukas 9, Dario 13, Valentin 16, Earnie 18. Hinzu kommen 20 gemeinsame Integrations-/Abstimmungsstunden und 19 Pufferstunden; grober Gesamtansatz 110 Personenstunden. Zwei P1- und ein P2-Ticket sind Erweiterungen außerhalb dieses P0-Ansatzes. Das sind neue Schätzungen und keine vom Team bestätigten Zeitversprechen.

Kein Owner wartet auf Video, um seinen Pflichtpfad zu integrieren. Paarweise prüfen Luca/Earnie Fall-/Tabzustand, Lukas/Dario Audio-/Agentzustand und Valentin/Earnie Zahlen-/Erklärungsbezug. Alle fünf prüfen den Gesamtfall. Die [55 Abnahmefälle im Detailplan](implementation-plan.md#202-pflichtfälle) ergänzen die Ticketkriterien.

## Repo und Grenzen

Kleine passende Branches und Conventional Commits, gemeinsame Contracts, frühe Integration. Originalquellen unverändert. Zugangsdaten verbleiben lokal in ignorierten Verzeichnissen; keine persönlichen absoluten Dateipfade in Repo-Dokumenten. Eine neue Nachricht an Fachpersonen, eine Sprach-/Videodienst-Buchung oder ein Deployment ist durch die Planübernahme nicht erfolgt.

Die drei Szenarien, alle drei Säulen und der deutlich simulierte Vertragsfluss bleiben Pflichtumfang. Zuerst Video, zusätzliche Follow-up-Ansicht, Dark Mode, weitere Produkte/OCR/PDF kürzen. Ein ausgefallener Sprachkanal wird als offen benannt; ein Mikrofon-Icon allein ist kein fertiges Voice-Feature.
