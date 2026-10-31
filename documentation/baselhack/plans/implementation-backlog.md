# Pax LifeMap – Ticket-Backlog nach dem Workshop

Stand: 31.10.2026 · Version 2.0-workshop. Die Namen und Zuständigkeiten sowie Fortschritt am Agenten wurden vom Nutzer bestätigt. Alle Implementierungstickets sind geplant; der Workshop ist kein Implementierungsnachweis.

Der [Detailplan](implementation-plan.md), die [Workshop-Entscheide](workshop-decisions.md) und die [JSON-Fassung](../catalog/implementation-backlog.json) verwenden denselben Zuschnitt.

Die [Schnittstellen I01–I10](interface-contracts.md) aus dem zweiten Foto ergänzen die Übergaben. Das ist eine Konkretisierung der geplanten Arbeit, kein weiterer unbemerkter Zeitblock.

## Umfang und Aufwand

37 Arbeitspakete: **34 P0**, **2 P1** und **1 P2**. P0 umfasst **71 Personenstunden**, dazu **20 gemeinsame Integrations-/Abstimmungsstunden** und **19 Pufferstunden**: der bisherige grobe Gesamtrahmen bleibt **110 Personenstunden**. Die Schätzung ist neu an die Rollen angepasst und stammt nicht als Zeitvorgabe vom Whiteboard.

Das vorläufige 48-Stunden-Fenster beschreibt die gesamte Veranstaltung, keine neue Restzeit nach dem Workshop. Die tatsächliche Restzeit und bereits außerhalb dieses Repos erledigte Arbeiten sind nicht bekannt. P1/P2 sind nicht in der P0-Kapazität eingerechnet.

| Owner | Bestätigter Bereich | P0-Tickets | Eigene P0-Zeit |
|---|---|---:|---:|
| Luca | UI | 7 | 15 h |
| Lukas | Avatar | 6 | 9 h |
| Dario | Voice | 7 | 13 h |
| Valentin | Logik-Backend | 7 | 16 h |
| Earnie | KI-Backend | 7 | 18 h |

Qualität, Fachreview und Integration liegen gemeinsam beim Team. Es gibt keine erfundene sechste QA-Person. Die Backend-Grundlage liegt als zusätzlicher Umsetzungsvorschlag bei Earnie, fachliche Rechen-/Statusregeln bei Valentin; das Foto legt keinen separaten Prozess oder Backend-Stack fest.

## Integrationstore

| Gate | Nachweis |
|---|---|
| M0 | Roles, GraphContext, Agent contract, speech route and Angular shell agreed |
| M1 | One stored case, transcript/text proposal, progress and baseline work together |
| M2 | All five tabs, basic agent, voice and selected graphic are connected |
| M3 | Three scenarios and a truly context-bound explanation |
| M4 | Customer/advisor Summary export and stored demo journey |
| M5 | Voice/avatar/security negative cases, fresh-session demo and handoff |
| OPTIONAL | Only after complete P0 and explicit time check |

Abhängigkeiten gelten für Abnahme/Integration; vorbereitende Komponenten können mit gemeinsamen Fixtures früher entstehen. Der Paket-/Modell-/Speechzugang wird zuerst geprüft. Basic Agent, Voice, Summary und drei Szenarien bleiben im Kern; Video-Avatar und Follow-up sind zuerst kürzbare Erweiterungen.

## Übersicht

| ID | Owner | Prio | Aufgabe | Aufwand | Abhängigkeiten |
|---|---|---|---|---:|---|
| UI-01 | Luca | P0 | Angular-Shell mit fünf Workspace-Tabs | 2 h | keine |
| UI-02 | Luca | P0 | Zeitbudget-Einstieg und bestätigbare Profilkarten | 2 h | UI-01, LOG-01, AI-01 |
| UI-03 | Luca | P0 | Dynamische Zeitgrafik und fachliche Auswahlkontexte | 2.5 h | UI-02, LOG-02, LOG-03 |
| UI-04 | Luca | P0 | Drei Szenarien als Varianten derselben Dynamic View | 2.5 h | UI-03, LOG-04, LOG-05 |
| UI-05 | Luca | P0 | Chat, Info und kontextbezogenes Erklären | 2 h | UI-01, UI-03, AI-04 |
| UI-06 | Luca | P0 | Summary-Exporte und Demo-Journey im Workspace | 2 h | UI-04, AI-06, LOG-06 |
| UI-07 | Luca | P0 | Responsive Bedienung und Gesamt-UI-Abnahme | 2 h | UI-06, AV-06, VOICE-07, LOG-07, AI-07 |
| AV-01 | Lukas | P0 | Agent-Host und gemeinsame Darstellungs-Events | 1.5 h | keine |
| AV-02 | Lukas | P0 | Fortschrittsring und zugängliche Farbanzeige | 2 h | AV-01, LOG-01 |
| AV-03 | Lukas | P0 | Zustände idle, listening, thinking, speaking, error | 2 h | AV-01 |
| AV-04 | Lukas | P0 | Agent mit Voice und Grafik-Erklärung verbinden | 1.5 h | AV-03, VOICE-03, AI-04 |
| AV-05 | Lukas | P0 | Fallback und responsive Agentdarstellung | 1 h | AV-02, AV-04 |
| AV-06 | Lukas | P0 | Agent-/Progress-Integration und Abnahme | 1 h | AV-05 |
| VOICE-01 | Dario | P0 | Speech-Datenweg, Berechtigungen und Demo-Browser festlegen | 1.5 h | keine |
| VOICE-02 | Dario | P0 | Spracheingabe mit temporärer Verarbeitung | 2.5 h | VOICE-01, AI-01 |
| VOICE-03 | Dario | P0 | Sprachausgabe und sichere Voice-Auswahl | 2 h | VOICE-01 |
| VOICE-04 | Dario | P0 | Transkriptkorrektur und gemeinsamer Advisor-Turn | 2 h | VOICE-02, AI-03 |
| VOICE-05 | Dario | P0 | Abbruch, Echovermeidung und Agent-Synchronisation | 2 h | VOICE-03, VOICE-04, AV-03 |
| VOICE-06 | Dario | P0 | Speech-Fehler- und Datenschutzfälle prüfen | 2 h | VOICE-05 |
| VOICE-07 | Dario | P0 | Gesprochenen Demo-Dialog integrieren | 1 h | VOICE-06, AI-04 |
| LOG-01 | Valentin | P0 | Fachvertrag, GraphContext und Fortschrittsdaten | 2 h | keine |
| LOG-02 | Valentin | P0 | Logismata-Baseline und Antwortnormalisierung | 3 h | LOG-01, AI-01 |
| LOG-03 | Valentin | P0 | Budget und Kapitalzuordnung ohne Doppelzählung | 2 h | LOG-01, LOG-02 |
| LOG-04 | Valentin | P0 | Familien- und Pensionierungsphasen | 3 h | LOG-03 |
| LOG-05 | Valentin | P0 | Eigenheimvergleich und Reserven | 2 h | LOG-03 |
| LOG-06 | Valentin | P0 | Demo-Vertragsstatus und Regeln für Übergänge | 1.5 h | LOG-03, AI-02, AI-05 |
| LOG-07 | Valentin | P0 | Fachtests, Quellenreview und Domain-Klärung | 2.5 h | LOG-04, LOG-05, LOG-06 |
| AI-01 | Earnie | P0 | KI-Backend-Grundlage, geschützter Zugang und Modellroute | 3.5 h | keine |
| AI-02 | Earnie | P0 | Fallpersistenz, Versionierung und Werkzeuggrenzen | 3 h | AI-01, LOG-01 |
| AI-03 | Earnie | P0 | Zeitbudget, Rückfragen und bestätigbare Aufnahme | 2.5 h | AI-02 |
| AI-04 | Earnie | P0 | Erklärung genau der ausgewählten Grafikstelle | 2.5 h | AI-03, LOG-02 |
| AI-05 | Earnie | P0 | Handlungsoptionen und belegte Produktfakten | 2.5 h | AI-03, LOG-03 |
| AI-06 | Earnie | P0 | SummaryBundle für Kunde und Fachperson | 2 h | AI-02, AI-04, AI-05 |
| AI-07 | Earnie | P0 | AI-/Sicherheitsprüfung und startfähige Übergabe | 2 h | AI-06, LOG-06 |
| AV-07 | Lukas | P1 | Optionalen Video-Avatar ergänzen | 4 h | AV-06, VOICE-07, UI-07 |
| UI-08 | Luca | P1 | Follow-up-/Overview-Ansicht ergänzen | 2 h | UI-07, AI-06 |
| UI-09 | Luca | P2 | Optionalen Dark Mode prüfen | 1.5 h | UI-07 |

## Luca – UI

### UI-01 – Angular-Shell mit fünf Workspace-Tabs

P0 · geplant · 2 Personenstunden · M0

**Ergebnis:** Dynamic View, Agent-Slot und Navigation Progress / Graphics / Chat / Info / Summary.

**Abhängigkeiten:** keine

**Workshop-Bezug:** W02, W03

**Schnittstellen:** I02

**Abnahme:**

- [ ] Pax-UI-Zugriff und kompatibler Angular-Build geprüft; transparenter Marken-Fallback möglich.
- [ ] Eine Fall-/Versionsquelle für alle fünf Tabs; kein Chat als separate Schatten-App.
- [ ] Grafik ist die Hauptfläche; Produktfläche bleibt vor Bedarfsreife ohne Verkaufspriorisierung.

### UI-02 – Zeitbudget-Einstieg und bestätigbare Profilkarten

P0 · geplant · 2 Personenstunden · M1

**Ergebnis:** Opener, Zeitbudgetwahl und Eingabekarten innerhalb des Workspaces.

**Abhängigkeiten:** UI-01, LOG-01, AI-01

**Workshop-Bezug:** W01, W03

**Schnittstellen:** I01, I02, I10

**Abnahme:**

- [ ] Zeitbudget beeinflusst Detailgrad, nicht erforderliche Fachprüfungen.
- [ ] Ziele, Haushalt, Budget und alle Säulen bleiben im kurzen Modus erfasst oder ausdrücklich offen.
- [ ] Feldvorschläge werden bestätigt; keine automatische Profilmutation durch Sprache oder Chat.

### UI-03 – Dynamische Zeitgrafik und fachliche Auswahlkontexte

P0 · geplant · 2.5 Personenstunden · M2

**Ergebnis:** Zeitachse mit erklärbarer Tabelle und selektierbarer Person, Periode und Kennzahl.

**Abhängigkeiten:** UI-02, LOG-02, LOG-03

**Workshop-Bezug:** W02, W05, W07

**Schnittstellen:** I04, I07

**Abnahme:**

- [ ] Jede Auswahl ist an Profil-, Szenario- und Run-Version gebunden.
- [ ] Farblegende, Einheiten und Datenqualität sind erkennbar; Skizzenjahre sind keine harte Modellgrenze.
- [ ] Veraltete Antworten ersetzen nicht den aktuellen Grafikzustand.

### UI-04 – Drei Szenarien als Varianten derselben Dynamic View

P0 · geplant · 2.5 Personenstunden · M3

**Ergebnis:** Familie, Eigenheim und Pensionierung als gespeicherte Vorher-/Nachher-Varianten.

**Abhängigkeiten:** UI-03, LOG-04, LOG-05

**Workshop-Bezug:** W02, W05

**Schnittstellen:** I03, I04

**Abnahme:**

- [ ] Kein Pflichtszenario ist nur ein dekorativer Regler.
- [ ] Baseline, Kapitalbindung und Unsicherheiten bleiben sichtbar.
- [ ] Tabwechsel verliert weder gewählte Periode noch aktuelle Variante.

### UI-05 – Chat, Info und kontextbezogenes Erklären

P0 · geplant · 2 Personenstunden · M3

**Ergebnis:** Einstieg „Diese Stelle erklären“ aus Grafik und Info in denselben Advisor.

**Abhängigkeiten:** UI-01, UI-03, AI-04

**Workshop-Bezug:** W03, W07

**Schnittstellen:** I05, I07

**Abnahme:**

- [ ] Graph-ID, Kennzahl, Zeitraum, Person und Run-ID werden explizit übergeben.
- [ ] Glossar und fachliche Erklärung bleiben von Produktwerbung getrennt.
- [ ] Ein nicht verstandener Begriff kann textlich und über den freigegebenen Voice-Kanal erklärt werden.

### UI-06 – Summary-Exporte und Demo-Journey im Workspace

P0 · geplant · 2 Personenstunden · M4

**Ergebnis:** Kunden-/Fachperson-Exportauswahl und gespeicherter Demo-Antrags-/Portalstatus.

**Abhängigkeiten:** UI-04, AI-06, LOG-06

**Workshop-Bezug:** W06, W03

**Schnittstellen:** I08

**Abnahme:**

- [ ] Beide Summary-Sichten verwenden dieselbe bestätigte Datenversion.
- [ ] Download/Übergabevorbereitung sendet keine Mail oder Nachricht automatisch.
- [ ] Demo-Offerte, Antrag und Demo-Police sind unterschieden; keine Dateneingabe wird wiederholt.

### UI-07 – Responsive Bedienung und Gesamt-UI-Abnahme

P0 · geplant · 2 Personenstunden · M5

**Ergebnis:** Integrierter Workspace auf dem festgelegten Demo-Gerät mit Tastatur-/Fehlerpfaden.

**Abhängigkeiten:** UI-06, AV-06, VOICE-07, LOG-07, AI-07

**Workshop-Bezug:** W02, W03, W05, W06, W07

**Schnittstellen:** I01, I04, I05, I06, I08, I10

**Abnahme:**

- [ ] Agent und Tabaktionen sind auch auf schmalem Display erreichbar.
- [ ] Grafik, Voice, Info und Summary bleiben versionskonsistent.
- [ ] Ein kompletter neuer Durchlauf mit Reload und Demo-Police ist gemeinsam gezeigt.

### UI-08 – Follow-up-/Overview-Ansicht ergänzen

P1 · geplant · 2 Personenstunden · OPTIONAL

**Ergebnis:** Übersicht offener Schritte und wiederaufnehmbarer Fall nach der Beratung.

**Abhängigkeiten:** UI-07, AI-06

**Workshop-Bezug:** W10

**Schnittstellen:** I02, I08

**Abnahme:**

- [ ] Vom notwendigen P0-Portalstatus und Summary-Export unterschieden.
- [ ] Geplante Folgeaktionen werden nicht automatisch an Dritte versendet.
- [ ] Kein angeblich beschlossener Kanal oder Versandtermin aus dem eingeklammerten Boardpunkt abgeleitet.

### UI-09 – Optionalen Dark Mode prüfen

P2 · geplant · 1.5 Personenstunden · OPTIONAL

**Ergebnis:** Darstellungsvariante nur bei freier Zeit und bestätigter Priorisierung.

**Abhängigkeiten:** UI-07

**Workshop-Bezug:** W11

**Schnittstellen:** kein neuer Payload; Darstellung auf bestehendem Vertrag

**Abnahme:**

- [ ] Mondsymbol ist eine Interpretation der Skizze, keine bestätigte Pflichtfunktion.
- [ ] Kontrast und Grafikfarben bleiben verständlich.
- [ ] Kein Kernvergleich oder Audio-/Exportfehler wird dafür zurückgestellt.


## Lukas – Avatar

### AV-01 – Agent-Host und gemeinsame Darstellungs-Events

P0 · geplant · 1.5 Personenstunden · M0

**Ergebnis:** Angular-Agentkomponente mit definiertem Input-/Eventvertrag.

**Abhängigkeiten:** keine

**Workshop-Bezug:** W02, W04

**Schnittstellen:** I06, I09

**Abnahme:**

- [ ] Agent ist unabhängig vom aktiven Tab sichtbar.
- [ ] Komponente entscheidet weder Datenreife noch Versicherbarkeit selbst.
- [ ] Technische Zustände werden von tatsächlichen App-/Voice-Ereignissen übernommen.

### AV-02 – Fortschrittsring und zugängliche Farbanzeige

P0 · geplant · 2 Personenstunden · M1

**Ergebnis:** Fortschritt direkt am Agenten mit Text und offenen Punkten.

**Abhängigkeiten:** AV-01, LOG-01

**Workshop-Bezug:** W03, W04

**Schnittstellen:** I09

**Abnahme:**

- [ ] Ring ist Erfassungs-/Beratungsfortschritt, kein Risiko- oder Versicherungs-Score.
- [ ] Unbekannt und menschlich ungeprüft werden nicht durch grüne Darstellung versteckt.
- [ ] Progress-Tab und Ring lesen denselben Backend-Fortschritt.

### AV-03 – Zustände idle, listening, thinking, speaking, error

P0 · geplant · 2 Personenstunden · M2

**Ergebnis:** Einfache Agentdarstellung ohne verpflichtenden Videodienst.

**Abhängigkeiten:** AV-01

**Workshop-Bezug:** W04

**Schnittstellen:** I06

**Abnahme:**

- [ ] Speaking startet erst bei tatsächlicher Audioausgabe, nicht schon bei fertigem AI-Text.
- [ ] Kein psychologischer oder emotionaler Kunden-Score aus Avataranimation.
- [ ] Status ist auch ohne Farbe/Animation verständlich.

### AV-04 – Agent mit Voice und Grafik-Erklärung verbinden

P0 · geplant · 1.5 Personenstunden · M3

**Ergebnis:** Gemeinsame Turn-/Erklärungsreferenz für Agent, Text und Audio.

**Abhängigkeiten:** AV-03, VOICE-03, AI-04

**Workshop-Bezug:** W04, W07

**Schnittstellen:** I05, I06, I07

**Abnahme:**

- [ ] Abbruch, neue Auswahl und Fehler beenden alte Darstellungszustände.
- [ ] Verspätete Events eines alten Turns werden verworfen.
- [ ] Agent verweist auf dieselbe Grafikstelle wie der sichtbare Erklärungstext.

### AV-05 – Fallback und responsive Agentdarstellung

P0 · geplant · 1 Personenstunden · M4

**Ergebnis:** Agent bleibt ohne Video, Ton oder Animation nutzbar.

**Abhängigkeiten:** AV-02, AV-04

**Workshop-Bezug:** W04

**Schnittstellen:** I06

**Abnahme:**

- [ ] Video-/TTS-Ausfall blockiert weder Beratung noch Summary.
- [ ] Kein Kamera-Zugriff allein für die Agentdarstellung.
- [ ] Reduzierte Bewegung und schmale Ansicht sind berücksichtigt.

### AV-06 – Agent-/Progress-Integration und Abnahme

P0 · geplant · 1 Personenstunden · M5

**Ergebnis:** Prüfbarer Durchlauf der Agentzustände und der Progress-Semantik.

**Abhängigkeiten:** AV-05

**Workshop-Bezug:** W04

**Schnittstellen:** I06, I09

**Abnahme:**

- [ ] 100 Prozent Datenaufnahme wird nicht als bestehender Versicherungsschutz erklärt.
- [ ] Offener Reviewstatus bleibt auch bei abgeschlossener Aufnahme sichtbar.
- [ ] Fehler und Unterbrechung hinterlassen keinen dauerhaft sprechenden Agenten.

### AV-07 – Optionalen Video-Avatar ergänzen

P1 · geplant · 4 Personenstunden · OPTIONAL

**Ergebnis:** Freigegebener Video-Renderer hinter unverändertem Agentvertrag.

**Abhängigkeiten:** AV-06, VOICE-07, UI-07

**Workshop-Bezug:** W08

**Schnittstellen:** I06

**Abnahme:**

- [ ] Explizites Nice-to-have; P0 weder davon noch vom Videodienst abhängig.
- [ ] Kein Kamera-Zwang, keine ungeklärte Audio-/Datenweitergabe.
- [ ] Ausfall fällt auf einfache Agentdarstellung mit korrektem Status zurück.


## Dario – Voice

### VOICE-01 – Speech-Datenweg, Berechtigungen und Demo-Browser festlegen

P0 · geplant · 1.5 Personenstunden · M0

**Ergebnis:** Freigegebene STT-/TTS-Adaptergrenze und dokumentierter Kompatibilitätsnachweis.

**Abhängigkeiten:** keine

**Workshop-Bezug:** W09

**Schnittstellen:** I01, I05, I10

**Abnahme:**

- [ ] Mikrofon erst nach bewusster Nutzeraktion und Browserfreigabe.
- [ ] Browser-Speech wird nicht pauschal als lokal angenommen; Empfänger sind bekannt.
- [ ] Bei fehlender Freigabe bleibt Text nutzbar und Voice offen statt als fertig markiert.

### VOICE-02 – Spracheingabe mit temporärer Verarbeitung

P0 · geplant · 2.5 Personenstunden · M1

**Ergebnis:** Kurzer Push-to-talk-Pfad bis zum finalen Transkript.

**Abhängigkeiten:** VOICE-01, AI-01

**Workshop-Bezug:** W09

**Schnittstellen:** I01

**Abnahme:**

- [ ] Audioformat/-größe/-dauer begrenzt; keine unkontrollierte Rohaufnahme gespeichert.
- [ ] Zwischenresultate gelten nicht als bestätigte Fachdaten.
- [ ] Ablehnung, fehlendes Gerät, Timeout und unverständliche Eingabe haben Textfallback.

### VOICE-03 – Sprachausgabe und sichere Voice-Auswahl

P0 · geplant · 2 Personenstunden · M2

**Ergebnis:** Vorlesbarer bestätigter Antworttext mit sichtbarer Stop-/Mute-Aktion.

**Abhängigkeiten:** VOICE-01

**Workshop-Bezug:** W09, W07

**Schnittstellen:** I05, I06

**Abnahme:**

- [ ] TTS verwendet denselben Text und dieselben Zahlen wie Chat/Erklärung.
- [ ] Lokale oder freigegebene Remote-Stimme explizit ausgewählt; keine stille Anbieteränderung.
- [ ] Audio beginnt erst nach Nutzeraktivierung und lässt sich sofort stoppen.

### VOICE-04 – Transkriptkorrektur und gemeinsamer Advisor-Turn

P0 · geplant · 2 Personenstunden · M2

**Ergebnis:** Bearbeitbares Transkript und Bestätigung vor fachlicher Mutation.

**Abhängigkeiten:** VOICE-02, AI-03

**Workshop-Bezug:** W09, W01

**Schnittstellen:** I01, I02, I10

**Abnahme:**

- [ ] Verhörte Geldwerte werden vor Speicherung korrigierbar gezeigt.
- [ ] Text und Voice nutzen dieselbe Message-ID und dieselbe Fallversion.
- [ ] Wiederholtes Senden erzeugt keinen doppelten Feldvorschlag oder Antrag.
- [ ] I10 aktualisiert den Kontext; vor Antwortstart aktuelle Referenz prüfen, nach Reconnect Snapshot abstimmen.

### VOICE-05 – Abbruch, Echovermeidung und Agent-Synchronisation

P0 · geplant · 2 Personenstunden · M3

**Ergebnis:** Eindeutiger Speech-Lebenszyklus mit Turn-/Kontextbindung.

**Abhängigkeiten:** VOICE-03, VOICE-04, AV-03

**Workshop-Bezug:** W09, W04, W07

**Schnittstellen:** I06, I07, I10

**Abnahme:**

- [ ] P0 zeichnet beim eigenen Vorlesen nicht parallel weiter auf.
- [ ] Neue Grafikversion oder Stop beendet alte Ausgabe und verwirft verspätete Callbacks.
- [ ] Listening/Thinking/Speaking werden aus tatsächlichen Vorgängen signalisiert.

### VOICE-06 – Speech-Fehler- und Datenschutzfälle prüfen

P0 · geplant · 2 Personenstunden · M4

**Ergebnis:** Negative Tests der erlaubten Audioverarbeitung.

**Abhängigkeiten:** VOICE-05

**Workshop-Bezug:** W09

**Schnittstellen:** I01, I05, I06

**Abnahme:**

- [ ] Kein Mikrofon-Autostart bei Tabwechsel, Reload oder erneutem Öffnen.
- [ ] Keine Rohaufnahmen/Transkripte in allgemeiner Telemetrie.
- [ ] Nicht unterstützte APIs führen nicht zu ungefragtem Cloud-Speech.

### VOICE-07 – Gesprochenen Demo-Dialog integrieren

P0 · geplant · 1 Personenstunden · M5

**Ergebnis:** Eine neue gesprochene Angabe und eine tatsächliche kontextgebundene Audioerklärung.

**Abhängigkeiten:** VOICE-06, AI-04

**Workshop-Bezug:** W09, W07

**Schnittstellen:** I01, I05, I06, I10

**Abnahme:**

- [ ] Aufnahme, Korrektur, Bestätigung und neue Berechnung sind verbunden.
- [ ] Die Antwort erklärt eine konkret ausgewählte Grafikstelle.
- [ ] Textbedienung funktioniert durchgängig auch nach Audiofehler.


## Valentin – Logik-Backend

### LOG-01 – Fachvertrag, GraphContext und Fortschrittsdaten

P0 · in Arbeit · 2 Personenstunden · M0

**Ergebnis:** Gemeinsame Schemas für Datenreife, Geld, Zeit, Szenarien und Auswahlkontext.

**Abhängigkeiten:** keine

**Workshop-Bezug:** W04, W05, W07

**Schnittstellen:** I02, I03, I04, I07, I09, I10

**Abnahme:**

- [ ] Unbekannt, Schätzung, Bestätigung und Fachreview bleiben getrennt.
- [ ] GraphContext enthält Run, Profil-/Szenarioversion, Person, Kennzahl und Periode.
- [ ] Fortschritt basiert auf erledigten Pflichtgruppen, nicht auf Risikolücken.

**Implementierungsstand (31.10.2026):** Gemeinsame Laufzeitschemas, GraphContext und Datenreife implementiert; Einbindung in den autorisierten Fallstore noch offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


### LOG-02 – Logismata-Baseline und Antwortnormalisierung

P0 · in Arbeit · 3 Personenstunden · M1

**Ergebnis:** Serverseitiger Adapter für geeignete Baseline-/Grenz-/Metadatenpfade.

**Abhängigkeiten:** LOG-01, AI-01

**Workshop-Bezug:** W05

**Schnittstellen:** I03, I04

**Abnahme:**

- [ ] Token nie im Client; passende Orte, Einheiten und benötigter Bedarf validiert.
- [ ] Risiko-Code 0 bis zur Klärung reviewpflichtig; HTTP 200 ist nicht alleinige Freigabe.
- [ ] Begrenzte Fehlerpfade und Replay nur bei passendem vollständigem Input-Hash.

**Implementierungsstand (31.10.2026):** Sechs Operationen mit Replay-/Live-Adapter implementiert; Metadaten-Smoke erfolgreich. Weitere priorisierte Mapper und Fachfreigaben offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


### LOG-03 – Budget und Kapitalzuordnung ohne Doppelzählung

P0 · in Arbeit · 2 Personenstunden · M2

**Ergebnis:** Drei-Säulen-/Budgetausgabe mit Herkunft und verfügbarer Liquidität.

**Abhängigkeiten:** LOG-01, LOG-02

**Workshop-Bezug:** W05

**Schnittstellen:** I04, I09

**Abnahme:**

- [ ] Brutto/Netto, Monate/Jahre und bereits enthaltene Steuern/Beiträge korrekt behandelt.
- [ ] Bedarf unbekannt erzeugt keine falsche Null-Lücke.
- [ ] Kapital wird nicht gleichzeitig vollständig mehreren Zielen zugeordnet.

**Implementierungsstand (31.10.2026):** Budget, explizite Kapitalzuordnung und getrennte Säulenübersicht mit Quellen implementiert; Integration in den gemeinsamen Fall bleibt offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


### LOG-04 – Familien- und Pensionierungsphasen

P0 · in Arbeit · 3 Personenstunden · M3

**Ergebnis:** Gespeicherte Szenarioänderungen mit berechenbaren Differenzen und Fachgrenzen.

**Abhängigkeiten:** LOG-03

**Workshop-Bezug:** W05

**Schnittstellen:** I03, I04

**Abnahme:**

- [ ] Pensumswechsel aktualisiert bestätigte Cashflows; PK-Folge nicht pauschal proportional.
- [ ] Erwerbsende, Rentenbeginn und Überbrückung getrennt.
- [ ] Phasen und Kapitalerschöpfung sichtbar; nicht unterstützte Regeln bleiben offen.

**Implementierungsstand (31.10.2026):** Familien-Cashflow und endliches Spar-/Entnahmemodell vorhanden; mehrphasige Pensionierung und bestätigte Leistungsfolgen offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


### LOG-05 – Eigenheimvergleich und Reserven

P0 · in Arbeit · 2 Personenstunden · M3

**Ergebnis:** Beispiel-Eigenmittellücke und Auswirkungen auf andere Ziele.

**Abhängigkeiten:** LOG-03

**Workshop-Bezug:** W05

**Schnittstellen:** I03, I04

**Abnahme:**

- [ ] Quoten/Zinsen sind sichtbare Annahmen, keine Kreditentscheidung.
- [ ] Gebundene Vorsorgemittel werden nicht still als freie Mittel gerechnet.
- [ ] Unfinanziertes Ziel und Reserveverzehr bleiben erkennbar.

**Implementierungsstand (31.10.2026):** Eigenmittelvergleich, Kostenszenario, Reserve und Zuordnungsledger vorhanden; Speicherung/Vergleich am gemeinsamen Fall offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


### LOG-06 – Demo-Vertragsstatus und Regeln für Übergänge

P0 · geplant · 1.5 Personenstunden · M4

**Ergebnis:** Fachliche State Machine vom Vorschlag bis zur Demo-Police auf gespeicherten Objekten.

**Abhängigkeiten:** LOG-03, AI-02, AI-05

**Workshop-Bezug:** W06

**Schnittstellen:** I02, I08

**Abnahme:**

- [ ] Aktuelle Empfehlung/Offerte und erforderlicher Review sind Vorbedingungen.
- [ ] Antrag, Annahme und Police getrennt; Einreichung idempotent.
- [ ] Keine echte Signatur, Annahme oder Versicherungsdeckung behauptet.

### LOG-07 – Fachtests, Quellenreview und Domain-Klärung

P0 · in Arbeit · 2.5 Personenstunden · M5

**Ergebnis:** Nachvollziehbare Domain-Invarianten und offene Pax-Fragen mit tatsächlichem Status.

**Abhängigkeiten:** LOG-04, LOG-05, LOG-06

**Workshop-Bezug:** W05, W06, W07

**Schnittstellen:** I03, I04, I08, I10

**Abnahme:**

- [ ] Provider-/Muster-/vlot-Werte werden nicht ohne identische Annahmen gleichgesetzt.
- [ ] Kleine Risikolücken, Schätzungen und Entwurfsstatus bleiben erklärbar.
- [ ] Fachliche Vorbehalte sind in Grafik, Empfehlung und Export gleich.


**Implementierungsstand (31.10.2026):** Automatisierte Fach-, Adapter- und HTTP-Tests angelegt; Fachreview und die vollständige Journey-Abnahme bleiben offen. Siehe [Code-/Prüfnachweis](../reports/logic-backend-implementation.md).


## Earnie – KI-Backend

### AI-01 – KI-Backend-Grundlage, geschützter Zugang und Modellroute

P0 · geplant · 3.5 Personenstunden · M0

**Ergebnis:** Gemeinsames Backend-Grundgerüst mit Sitzung, minimiertem Kontext und echtem Modell-Smoke.

**Abhängigkeiten:** keine

**Workshop-Bezug:** W01, W07

**Schnittstellen:** I01, I02, I05, I10

**Abnahme:**

- [ ] Fallbesitzer serverseitig geprüft; Provider-/Registry-Token getrennt und nicht im Client.
- [ ] Zulässiger Modellaufruf und erlaubter Datenweg nachgewiesen.
- [ ] Textfallback wird nicht als erfolgreicher Modellaufruf ausgegeben.

### AI-02 – Fallpersistenz, Versionierung und Werkzeuggrenzen

P0 · geplant · 3 Personenstunden · M1

**Ergebnis:** Ein gespeicherter Fall mit gemeinsamen Versionen für alle Tabs/Kanäle.

**Abhängigkeiten:** AI-01, LOG-01

**Workshop-Bezug:** W02, W03, W07

**Schnittstellen:** I02, I03, I04, I10

**Abnahme:**

- [ ] Bestätigte Daten unveränderlich versioniert; Reload und konkurrierende Änderungen behandelt.
- [ ] AI-Toolargumente umgehen weder Rollen noch erlaubte Felder.
- [ ] Veralteter Grafik-/Szenariokontext wird nicht mit aktuellen Zahlen gemischt.
- [ ] Minimaler autorisierter AdvisorContext und Änderungsereignis aus dem bestätigten JSON-Fallstand.

### AI-03 – Zeitbudget, Rückfragen und bestätigbare Aufnahme

P0 · geplant · 2.5 Personenstunden · M2

**Ergebnis:** Adaptiver Gesprächsmodus mit schemafähigen Feldvorschlägen.

**Abhängigkeiten:** AI-02

**Workshop-Bezug:** W01, W09

**Schnittstellen:** I01, I02, I05

**Abnahme:**

- [ ] Opener fragt nach Zeit; Modus und spätere Änderung sind im Fall gespeichert.
- [ ] Kurzmodus verkürzt Formulierung, nicht Bedarfserfassung oder Pflichtprüfung.
- [ ] Neue Text-/Voice-Eingaben werden vorgeschlagen und bestätigt statt ungeprüft übernommen.

### AI-04 – Erklärung genau der ausgewählten Grafikstelle

P0 · geplant · 2.5 Personenstunden · M3

**Ergebnis:** Kontextgebundene Erklärungen und verständliche Info-Texte.

**Abhängigkeiten:** AI-03, LOG-02

**Workshop-Bezug:** W07, W03

**Schnittstellen:** I04, I05, I07, I10

**Abnahme:**

- [ ] Run, Person, Kennzahl und Zeitfenster werden serverseitig geprüft.
- [ ] Betrag/Periode und Erklärung stimmen mit der Auswahl überein; keine freien Prämien.
- [ ] Keine behauptete psychologische Diagnose bei wiederholter Nachfrage.

### AI-05 – Handlungsoptionen und belegte Produktfakten

P0 · geplant · 2.5 Personenstunden · M4

**Ergebnis:** Kleine regelbasierte Auswahl mit menschlichem Prüfpfad.

**Abhängigkeiten:** AI-03, LOG-03

**Workshop-Bezug:** W02, W06

**Schnittstellen:** I04, I05

**Abnahme:**

- [ ] Produktfläche erst nach Bedarf, Tragbarkeit und Datenreife freigeben.
- [ ] Persönliche Angemessenheit nicht aus Haushaltsvermögen ableiten.
- [ ] Alternative ohne neues Produkt sowie offene Mindest-/Produktregeln erläutern.

### AI-06 – SummaryBundle für Kunde und Fachperson

P0 · geplant · 2 Personenstunden · M4

**Ergebnis:** Zwei lesbare Sichten desselben Dossiers mit Prüfstatus und offenen Fragen.

**Abhängigkeiten:** AI-02, AI-04, AI-05

**Workshop-Bezug:** W06

**Schnittstellen:** I08

**Abnahme:**

- [ ] Ein Snapshot/Versionssatz für beide Sichten; kein zweites Rechenmodell für Exporte.
- [ ] Fachpersonensicht ergänzt nachvollziehbare Quellen/Prüfaufträge, keine Schlüssel.
- [ ] Export und Übergabevorbereitung senden keine Nachricht und buchen keinen Termin.

### AI-07 – AI-/Sicherheitsprüfung und startfähige Übergabe

P0 · geplant · 2 Personenstunden · M5

**Ergebnis:** Geprüfte Modell-/Toolgrenzen, Zugriffsschutz und dokumentierter Start.

**Abhängigkeiten:** AI-06, LOG-06

**Workshop-Bezug:** W06, W07, W09

**Schnittstellen:** I01, I02, I05, I08, I10

**Abnahme:**

- [ ] Fremde Case-ID, Prompt Injection, sensible Logs und Secret-/Bundle-Leaks geprüft.
- [ ] Benötigte Transport-/Speicherverschlüsselung tatsächlich nachgewiesen; keine Compliance-Pauschalbehauptung.
- [ ] Echter Modelltest, Reviewrollen und Versionskonsistenz gemeinsam abgenommen.

## Migration aus dem bisherigen Backlog

Die alten 36 Tickets werden nicht als erledigt markiert. Ihre Aufgaben sind in die bestätigten Rollen neu zugeschnitten. Gleich geschriebene AI-IDs können in Version 2.0 einen anderen Zuschnitt haben; für Übernahmen immer die Version mitführen.

| Alte ID (v1) | Neue IDs (Workshop v2) |
|---|---|
| UX-01 | UI-01 |
| UX-02 | UI-02 |
| UX-03 | UI-03 |
| UX-04 | UI-04 |
| UX-05 | UI-05, UI-06 |
| UX-06 | UI-07 |
| UX-07 | UI-07 |
| CAL-01 | LOG-01 |
| CAL-02 | LOG-02 |
| CAL-03 | LOG-03 |
| CAL-04 | LOG-02, LOG-03 |
| CAL-05 | LOG-04 |
| CAL-06 | LOG-05 |
| CAL-07 | LOG-02 |
| CAL-08 | LOG-07 |
| AI-01 | AI-01 |
| AI-02 | AI-03 |
| AI-03 | AI-03 |
| AI-04 | AI-04 |
| AI-05 | AI-05 |
| AI-06 | AI-05, AI-06 |
| AI-07 | AI-07 |
| APP-01 | AI-01 |
| APP-02 | AI-02 |
| APP-03 | AI-02, LOG-01 |
| APP-04 | LOG-06 |
| APP-05 | UI-06, AI-06, LOG-06 |
| APP-06 | AI-07 |
| APP-07 | AI-07 |
| QA-01 | UI-01, LOG-01, AI-01 |
| QA-02 | AI-05, LOG-07 |
| QA-03 | LOG-07, AI-07 |
| QA-04 | LOG-07, AI-07, UI-07 |
| QA-05 | UI-07, AV-06, VOICE-07, LOG-07, AI-07 |
| QA-06 | UI-07, AV-06, VOICE-07, LOG-07, AI-07 |
| QA-07 | UI-07, AV-06, VOICE-06, LOG-07, AI-07 |

## Dynamische Gesprächsaktualisierung

I10 konkretisiert die bestehenden Fall-/Voice-Integrationspakete: Earnie baut ContextBuilder und Update-Kanal, Dario aktualisiert vor Turns und bricht veraltete Ausgabe ab, Valentin liefert gültige Runreferenzen, Luca gleicht Grafik/Chat ab, Lukas übernimmt den Abbruch. [Schnittstellen Abschnitt 9](interface-contracts.md#9-gemeinsame-json-und-dynamischer-gesprächskontext-für-dario) beschreibt HTTP/SSE als Vorschlag. Die Schätzungen bleiben vorläufig und werden vor Umsetzung gegen die tatsächliche Restzeit geprüft. Die 55 geplanten Abnahmefälle enthalten Reconnect, laufende Fachänderung und Tempowechsel.
