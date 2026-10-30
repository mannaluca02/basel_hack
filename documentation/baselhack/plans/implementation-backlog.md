# Pax LifeMap – umsetzbares Ticket-Backlog

Stand: 30.10.2026. Angular ist gesetzt. Alle Tickets stehen auf geplant; es wurden keine externen Issues erstellt.
Der [Detailplan](implementation-plan.md) erklärt Fachregeln, Screens, Schnittstellen und Abnahme. Die [JSON-Fassung](../catalog/implementation-backlog.json) enthält dieselben Aufgaben maschinenlesbar.

## Aufwand und Verwendung

36 P0-Arbeitspakete mit zusammen **77 Personenstunden**. Dazu **20 Personenstunden** gemeinsame Abstimmung und **13 Personenstunden** Puffer: zusammen ungefähr **110 Personenstunden** in einem vorläufigen 48-Stunden-Fenster. Die Zeit ist eine grobe Schätzung für den abgegrenzten MVP, keine Lieferzusage.

| Person | Eigene Tickets | Schwerpunkt |
|---|---:|---|
| Person 1 | 14 h | Angular / UX |
| Person 2 | 17 h | Daten / Berechnung |
| Person 3 | 15.5 h | AI / Empfehlungen |
| Person 4 | 15.5 h | Backend / Journey |
| Person 5 | 15 h | Fachprüfung / Integration |

Die 20 gemeinsamen Personenstunden decken zusammen Starts, Schnittstellenabsprachen, Gegenreviews und Domain-Abstimmung ab. Diese Zeit wird nicht noch einmal als kostenloses Pairing angesetzt. Die 13 Pufferstunden sind nicht für neue P1-Funktionen reserviert.

Abhängigkeiten benennen Voraussetzungen der endgültigen Abnahme. Vorbereitende UI-/AI-Arbeit mit gemeinsamem Vertrag und Fixture darf früher beginnen. Die Rolle Person 5 prüft Integration und Fachlichkeit; jeder Modulowner bleibt für seine eigenen Tests verantwortlich.

## Meilensteine

| Gate | Ziel |
|---|---|
| G0 | T+2: decisions/contracts/fixture |
| G1 | T+8: first saved vertical slice |
| G2 | T+16: baseline and first scenarios |
| G3 | T+24: three scenarios |
| G4 | T+38: recommendation and complete demo journey |
| G5 | T+44: integrated technical/domain checks |
| G6 | T+48: repeatable demo and handoff |

## Gesamtübersicht

| ID | Owner | Aufgabe | Aufwand | Gate | Abhängigkeiten |
|---|---|---|---:|---|---|
| UX-01 | Person 1 | Angular-/Pax-UI-Nachweis und App-Shell | 1.5 h | G0 | keine |
| UX-02 | Person 1 | Bestätigbares Profil, Ziele und Budgetformular | 2 h | G1 | UX-01, CAL-01, APP-01 |
| UX-03 | Person 1 | LifeMap mit Phasen, Säulen und offenen Fragen | 3 h | G2 | UX-02, CAL-03, CAL-04, APP-03 |
| UX-04 | Person 1 | Drei Szenariobildschirme mit Vorher-/Nachher | 3 h | G3 | UX-03, CAL-05, CAL-06 |
| UX-05 | Person 1 | Handlungsoptionen, Empfehlung und Journey-Oberfläche | 2 h | G4 | UX-02, AI-05, APP-04 |
| UX-06 | Person 1 | Responsive Bedienung, Fehler- und Ladezustände | 1.5 h | G5 | UX-04, UX-05 |
| UX-07 | Person 1 | UI für wiederholbare Vorführung vorbereiten | 1 h | G6 | UX-06, QA-05 |
| CAL-01 | Person 2 | Gemeinsame Schemas, Einheiten und Status festlegen | 1.5 h | G0 | QA-01 |
| CAL-02 | Person 2 | Serverseitigen Logismata-Adapter anbinden | 1.5 h | G1 | CAL-01, APP-01 |
| CAL-03 | Person 2 | Budget und Kapitalverfügbarkeit berechnen | 2 h | G1 | CAL-02 |
| CAL-04 | Person 2 | Drei-Säulen-Baseline für Risiko und Pensionierung | 3 h | G2 | CAL-02, CAL-07 |
| CAL-05 | Person 2 | Phasenmodell für Familie und Pensionierung | 3 h | G3 | CAL-03, CAL-04 |
| CAL-06 | Person 2 | Eigenheim- und Kapitalzuordnungsmodell | 2 h | G3 | CAL-01, CAL-03 |
| CAL-07 | Person 2 | Ergebnisnormalisierung und begrenzte Ausfallpfade | 2 h | G1 | CAL-02 |
| CAL-08 | Person 2 | Fachliche Invarianten und Adapterfälle prüfen | 2 h | G5 | CAL-04, CAL-05, CAL-06, CAL-07 |
| AI-01 | Person 3 | Zulässigen Modellpfad und minimierten Kontext nachweisen | 2 h | G1 | QA-01, CAL-01 |
| AI-02 | Person 3 | Freitext in bestätigbare Feldvorschläge überführen | 2.5 h | G2 | AI-01 |
| AI-03 | Person 3 | Nächste sinnvolle Frage und Datenreife bestimmen | 2 h | G2 | AI-02 |
| AI-04 | Person 3 | Ergebnisse mit Quellen und Unsicherheiten erklären | 2 h | G3 | AI-03, CAL-04 |
| AI-05 | Person 3 | Bedarfs- und Produktregeln für den Hauptfall | 3 h | G4 | AI-01, CAL-01, QA-02 |
| AI-06 | Person 3 | Angemessenheitsvorprüfung und menschliche Übergabe | 2 h | G4 | AI-05, APP-03 |
| AI-07 | Person 3 | AI-Evaluation und Missbrauchsfälle | 2 h | G5 | AI-02, AI-04, AI-05, AI-06 |
| APP-01 | Person 4 | Workspace, API-Grundgerüst und isolierte Demo-Sitzung | 2.5 h | G1 | keine |
| APP-02 | Person 4 | Persistenz, unveränderliche Versionen und Seed | 2.5 h | G1 | APP-01, CAL-01 |
| APP-03 | Person 4 | Case-/Calculation-/Review-Verträge integrieren | 2 h | G2 | APP-02, CAL-01 |
| APP-04 | Person 4 | Demo-Offerte, Antrag und Statusmaschine | 3 h | G4 | APP-02, AI-05 |
| APP-05 | Person 4 | Demo-Portal, Police und gemeinsames Dossier | 2 h | G4 | APP-04 |
| APP-06 | Person 4 | Sicherheits- und Auditschutz nachweisen | 2.5 h | G5 | APP-01, APP-02 |
| APP-07 | Person 4 | Reproduzierbaren Start und Demo-Konfiguration übergeben | 1 h | G6 | APP-05, APP-06 |
| QA-01 | Person 5 | Scope, Fixture und Abnahmekriterien festlegen | 2 h | G0 | keine |
| QA-02 | Person 5 | Produkt- und Fachquellen für den kleinen Katalog aufbereiten | 2 h | G2 | QA-01 |
| QA-03 | Person 5 | Frühe Pax-Abstimmung und Entscheidungslog | 1.5 h | G3 | QA-01 |
| QA-04 | Person 5 | Abnahmedatensätze und Testdurchlauf vorbereiten | 2.5 h | G2 | QA-01, CAL-01 |
| QA-05 | Person 5 | Gemeinsamen Gesamtfluss und drei Szenarien abnehmen | 3 h | G5 | UX-04, UX-05, CAL-08, AI-07, APP-05 |
| QA-06 | Person 5 | Pitch, Demoablauf und Übergabeunterlagen | 2 h | G6 | QA-05, APP-07 |
| QA-07 | Person 5 | Negative Sicherheits- und Datenschutzprüfung | 2 h | G5 | APP-06, AI-07 |

## Person 1 – Angular / UX

### UX-01 – Angular-/Pax-UI-Nachweis und App-Shell

P0 · geplant · 1.5 Personenstunden · G0

**Ergebnis:** Angular-Shell mit Theme, Navigation und zwei funktionierenden Pax-Komponenten; dokumentierter Paketstand.

**Abhängigkeiten:** keine

**Abnahme:**

- [ ] Registry-Zugriff und Peer Dependencies tatsächlich geprüft; kein erzwungener Versionskonflikt.
- [ ] Button und Formularfeld funktionieren im Build; notwendige Styles/Assets geladen.
- [ ] Bei Paketblockade bleibt Angular aktiv und ein kleiner Marken-Fallback wird transparent verwendet.

### UX-02 – Bestätigbares Profil, Ziele und Budgetformular

P0 · geplant · 2 Personenstunden · G1

**Ergebnis:** Eingabestrecke für Haushalt, Ziele, Budget und Versorgung auf gemeinsamem Fallvertrag.

**Abhängigkeiten:** UX-01, CAL-01, APP-01

**Abnahme:**

- [ ] Monat/Jahr, CHF, Brutto/Netto und unbekannte Angaben sind explizit.
- [ ] Bestätigung erzeugt eine gespeicherte Profilversion; Reload verliert den Fall nicht.
- [ ] Fehler sind am Feld und per Tastatur erreichbar; keine Produktauswahl vor Bedarfsaufnahme.

### UX-03 – LifeMap mit Phasen, Säulen und offenen Fragen

P0 · geplant · 3 Personenstunden · G2

**Ergebnis:** Zeitachse, zugängliche Tabelle und Ergebnisdetails für eine normalisierte Baseline.

**Abhängigkeiten:** UX-02, CAL-03, CAL-04, APP-03

**Abnahme:**

- [ ] Erste, zweite und dritte Säule bleiben erkennbar, auch bei fehlenden Daten.
- [ ] Perioden, Datenstand, Schätzungen und Reviewstatus sind sichtbar.
- [ ] Die Oberfläche rechnet Provider-Gesamtleistungen nicht nochmals eigenständig zusammen.

### UX-04 – Drei Szenariobildschirme mit Vorher-/Nachher

P0 · geplant · 3 Personenstunden · G3

**Ergebnis:** Familie, Eigenheim und Pensionierung bearbeiten gespeicherte Szenarien.

**Abhängigkeiten:** UX-03, CAL-05, CAL-06

**Abnahme:**

- [ ] Jede Änderung erzeugt einen neuen passenden Lauf statt dekorativer Zahlen.
- [ ] Baseline bleibt erhalten; geänderte Positionen und nicht berechenbare Folgen werden gezeigt.
- [ ] Mehrfachklick und verspätete Antwort ersetzen nicht den aktuell gewählten Stand.

### UX-05 – Handlungsoptionen, Empfehlung und Journey-Oberfläche

P0 · geplant · 2 Personenstunden · G4

**Ergebnis:** Verbundene UI von Strategie über Demo-Offerte/Antrag bis Portal.

**Abhängigkeiten:** UX-02, AI-05, APP-04

**Abnahme:**

- [ ] Maßnahmen und Alternative ohne neues Produkt erscheinen vor Produktdetails.
- [ ] Felder werden aus demselben Fall übernommen; Demo-Bezeichnung bleibt sichtbar.
- [ ] Reviewpflicht, veraltete Offerte und Zwischenstatus haben eigene Ansichten.

### UX-06 – Responsive Bedienung, Fehler- und Ladezustände

P0 · geplant · 1.5 Personenstunden · G5

**Ergebnis:** Kernfluss auf schmaler und breiter Ansicht mit verständlichen Zuständen.

**Abhängigkeiten:** UX-04, UX-05

**Abnahme:**

- [ ] Pflichtaktionen sind per Tastatur möglich und Fokus ist erkennbar.
- [ ] Farbe allein transportiert weder Datenqualität noch Risiken.
- [ ] Modell-/Providerfehler behalten den bisherigen Stand mit nachvollziehbarer Kennzeichnung.

### UX-07 – UI für wiederholbare Vorführung vorbereiten

P0 · geplant · 1 Personenstunden · G6

**Ergebnis:** Aufgeräumter vollständiger Hauptfall und verständliche Herkunftsdetails.

**Abhängigkeiten:** UX-06, QA-05

**Abnahme:**

- [ ] Keine toten Pflichtbuttons im Demo-Pfad.
- [ ] Mindestens eine neue Eingabe ist wirklich mit AI und Berechnung verbunden.
- [ ] Vorbereitung löscht oder verändert nicht still fremde Fälle.


## Person 2 – Daten / Berechnung

### CAL-01 – Gemeinsame Schemas, Einheiten und Status festlegen

P0 · geplant · 1.5 Personenstunden · G0

**Ergebnis:** Laufzeit-validierte Contracts und synthetische Vertrags-Fixture.

**Abhängigkeiten:** QA-01

**Abnahme:**

- [ ] Geld, Zeitraum, Basis, Herkunft, Bestätigung und Fachreview sind getrennt.
- [ ] Null, unbekannt und nicht anwendbar sind unterscheidbar.
- [ ] UI, Backend und AI können dieselbe Profil-/Ergebnishülle verwenden.

### CAL-02 – Serverseitigen Logismata-Adapter anbinden

P0 · geplant · 1.5 Personenstunden · G1

**Ergebnis:** Allowlist-Client mit sauberer Konfiguration, Zeitbegrenzung und Metadaten.

**Abhängigkeiten:** CAL-01, APP-01

**Abnahme:**

- [ ] Token bleibt serverseitig; lokale Variablennamen werden ausdrücklich zugeordnet.
- [ ] Ort, Alters-/3a-Grenzen und mindestens ein sinnvoller Rechenpfad sind aufrufbar.
- [ ] HTTP-Fehler und ungültige Antwortstruktur werden strukturiert zurückgegeben.

### CAL-03 – Budget und Kapitalverfügbarkeit berechnen

P0 · geplant · 2 Personenstunden · G1

**Ergebnis:** Normalisierte Cashflow- und freie-Mittel-Betrachtung.

**Abhängigkeiten:** CAL-02

**Abnahme:**

- [ ] Steuern und bestehende Vorsorgebeiträge werden nicht doppelt abgezogen.
- [ ] Statistische Budgetwerte bleiben bestätigbare Vorschläge.
- [ ] Negatives Budget und unbekannte Positionen verhindern eine falsche Tragbarkeit.

### CAL-04 – Drei-Säulen-Baseline für Risiko und Pensionierung

P0 · geplant · 3 Personenstunden · G2

**Ergebnis:** Ergebnisbereiche mit Bedarf, vorhandenen Leistungen, Kapital und Validierungsstand.

**Abhängigkeiten:** CAL-02, CAL-07

**Abnahme:**

- [ ] Risikoereignisse und betroffene Personen sind gemäß Schema gemappt.
- [ ] Fehlender Bedarf wird nicht als Null-Lücke behandelt.
- [ ] PK-Schätzung und bestätigte Werte bleiben verschieden; Gesamt-/Partnerwerte sind geprüft.

### CAL-05 – Phasenmodell für Familie und Pensionierung

P0 · geplant · 3 Personenstunden · G3

**Ergebnis:** Datierte Ereignisse mit vergleichbaren Phasen und erklärten Rechengrenzen.

**Abhängigkeiten:** CAL-03, CAL-04

**Abnahme:**

- [ ] Pensumswechsel ändert nach bestätigter Annahme Einkommen/Kosten und berechenbare Versorgung.
- [ ] Erwerbsende, Rentenbeginn und Überbrückung sind getrennt.
- [ ] Unbekannte künftige PK-/Kinderleistungsregeln bleiben als solche sichtbar.

### CAL-06 – Eigenheim- und Kapitalzuordnungsmodell

P0 · geplant · 2 Personenstunden · G3

**Ergebnis:** Beispiel-Eigenmittellücke, Reserve und laufender Budgetvergleich.

**Abhängigkeiten:** CAL-01, CAL-03

**Abnahme:**

- [ ] Demo-Quoten und Zinsen sind explizite Annahmen, keine Kreditzusage.
- [ ] Freie, reservierte und gebundene Mittel werden nicht vermischt.
- [ ] Derselbe Vermögenswert wird nicht vollständig für zwei Ziele gleichzeitig eingesetzt.

### CAL-07 – Ergebnisnormalisierung und begrenzte Ausfallpfade

P0 · geplant · 2 Personenstunden · G1

**Ergebnis:** Status pro Ergebnisbereich, Eingabe-Hashes und kontrollierter Replaymodus.

**Abhängigkeiten:** CAL-02

**Abnahme:**

- [ ] Risiko-Code 0 bleibt bis Klärung reviewpflichtig.
- [ ] Replay nur bei passendem Input-/Modell-Hash; neue Eingaben bekommen keine alten Scheinwerte.
- [ ] 401/403, Timeout, Schemafehler und Begrenzung führen nicht zu endlosen Wiederholungen.

### CAL-08 – Fachliche Invarianten und Adapterfälle prüfen

P0 · geplant · 2 Personenstunden · G5

**Ergebnis:** Aussagekräftige Domain-/Adaptertests mit dokumentierten Referenzannahmen.

**Abhängigkeiten:** CAL-04, CAL-05, CAL-06, CAL-07

**Abnahme:**

- [ ] Einheiten, fehlender Bedarf, Doppelzählung und Kapitalerschöpfung sind abgedeckt.
- [ ] Beispielantworten werden nicht als fachlich zertifizierte aktuelle Berechnung ausgegeben.
- [ ] Mindestens ein begrenzter Live-Smoke und seine tatsächlichen Grenzen sind protokolliert.


## Person 3 – AI / Empfehlungen

### AI-01 – Zulässigen Modellpfad und minimierten Kontext nachweisen

P0 · geplant · 2 Personenstunden · G1

**Ergebnis:** Tatsächlicher freigegebener Modellaufruf mit strukturierter Antwort.

**Abhängigkeiten:** QA-01, CAL-01

**Abnahme:**

- [ ] Empfänger, Datentypen und Konfiguration dokumentiert; kein beliebiger externer Host.
- [ ] Kein Anbieter-Token oder unnötiges Rohdokument im Modellkontext.
- [ ] Vorlagen-Fallback ist unterscheidbar und wird nicht als LLM ausgegeben.

### AI-02 – Freitext in bestätigbare Feldvorschläge überführen

P0 · geplant · 2.5 Personenstunden · G2

**Ergebnis:** Schemafähige Profil-/Ziel-Patches mit Bestätigungsschritt.

**Abhängigkeiten:** AI-01

**Abnahme:**

- [ ] Mindestens drei neue Eingabeformulierungen sinnvoll verarbeitet.
- [ ] Kein Modellvorschlag überschreibt bestätigte Felder ohne Benutzeraktion.
- [ ] Nur erlaubte Pfade; fremde IDs, Rollen und URLs abgewiesen.

### AI-03 – Nächste sinnvolle Frage und Datenreife bestimmen

P0 · geplant · 2 Personenstunden · G2

**Ergebnis:** Regelbasierte zulässige Fragengruppen mit AI-Formulierung.

**Abhängigkeiten:** AI-02

**Abnahme:**

- [ ] Budget, Bedarf, bestehende Deckung und PK-Unbekannt haben Vorrang vor Verkauf.
- [ ] Widersprüche führen zur Klärung, nicht zu stiller Auswahl einer Behauptung.
- [ ] Erledigungsbedingungen verhindern eine wiederholte Schleife derselben Frage.

### AI-04 – Ergebnisse mit Quellen und Unsicherheiten erklären

P0 · geplant · 2 Personenstunden · G3

**Ergebnis:** Ergebnisgebundene Erklärung mit Run- und Faktenreferenzen.

**Abhängigkeiten:** AI-03, CAL-04

**Abnahme:**

- [ ] Betrag, Zeitraum und Ursache stimmen mit dem aktuellen Ergebnis überein.
- [ ] Geschätzte oder reviewpflichtige Ergebnisse werden nicht als Garantie umformuliert.
- [ ] Ungültige Modellausgabe hat einen transparenten begrenzten Fehlerpfad.

### AI-05 – Bedarfs- und Produktregeln für den Hauptfall

P0 · geplant · 3 Personenstunden · G4

**Ergebnis:** Kuratierter kleiner Katalog mit Gründen, Sperren und Alternativen.

**Abhängigkeiten:** AI-01, CAL-01, QA-02

**Abnahme:**

- [ ] Maximal drei vertiefte Produktfamilien; Herkunft und Version je Regel.
- [ ] Lücke bleibt bei Nichtempfehlung sichtbar und die Entscheidung ist erklärt.
- [ ] Keine zusätzliche Versicherung und Datenbeschaffung sind gültige Ergebnisse.

### AI-06 – Angemessenheitsvorprüfung und menschliche Übergabe

P0 · geplant · 2 Personenstunden · G4

**Ergebnis:** Gespeicherte Prüfgründe und Übergabeansicht auf den passenden Fallversionen.

**Abhängigkeiten:** AI-05, APP-03

**Abnahme:**

- [ ] Persönliche Tragbarkeit wird nicht aus gemeinsamem Vermögen abgeleitet.
- [ ] Unbekannte oder nicht freigegebene Fachregeln blockieren die betroffene Verbindlichkeit.
- [ ] AI kann eine erforderliche menschliche Prüfung nicht selbst erledigen.

### AI-07 – AI-Evaluation und Missbrauchsfälle

P0 · geplant · 2 Personenstunden · G5

**Ergebnis:** Dokumentierte positive und negative AI-Fälle.

**Abhängigkeiten:** AI-02, AI-04, AI-05, AI-06

**Abnahme:**

- [ ] Prompt-Injection fordert weder Tokens noch fremde Fälle erfolgreich an.
- [ ] Produktwunsch am Anfang erzeugt keine voreilige persönliche Empfehlung.
- [ ] Zahlenbindung, Kontextminimierung und Fallbackverhalten sind geprüft.


## Person 4 – Backend / Journey

### APP-01 – Workspace, API-Grundgerüst und isolierte Demo-Sitzung

P0 · geplant · 2.5 Personenstunden · G1

**Ergebnis:** Gemeinsamer startfähiger TypeScript-Workspace mit Angular-/NestJS-Grenze.

**Abhängigkeiten:** keine

**Abnahme:**

- [ ] Eine definierte Toolchain; nur Umgebungsvariablen-Referenzen statt echter Schlüssel.
- [ ] Eigene Sitzung und Fallzuordnung vorhanden; kein global geteilter Fall.
- [ ] Frontend erreicht geschützte API und Statusfehler werden verständlich zurückgegeben.

### APP-02 – Persistenz, unveränderliche Versionen und Seed

P0 · geplant · 2.5 Personenstunden · G1

**Ergebnis:** Datenbankmigration, synthetischer Seed und bestätigte Fallversionen.

**Abhängigkeiten:** APP-01, CAL-01

**Abnahme:**

- [ ] Reload stellt den richtigen Fall wieder her.
- [ ] Bestätigte Profil-/Szenarioversionen werden nicht in-place umgeschrieben.
- [ ] Konkurrierende Änderungen an veralteter Version werden erkannt.

### APP-03 – Case-/Calculation-/Review-Verträge integrieren

P0 · geplant · 2 Personenstunden · G2

**Ergebnis:** Berechtigte Endpunkte mit Validierung und gemeinsamer Fehlerhülle.

**Abhängigkeiten:** APP-02, CAL-01

**Abnahme:**

- [ ] Modell- und UI-Aufträge durchlaufen dieselben Fall-/Fachprüfungen.
- [ ] Passender Input-Hash und Ergebnisversion werden gespeichert.
- [ ] Teilweise Ergebnisse und offene Reviewgründe sind abrufbar.

### APP-04 – Demo-Offerte, Antrag und Statusmaschine

P0 · geplant · 3 Personenstunden · G4

**Ergebnis:** Persistenter Demo-Vertragsprozess mit Idempotenz und Vorbedingungen.

**Abhängigkeiten:** APP-02, AI-05

**Abnahme:**

- [ ] Offerte ist eindeutig Demo und verwendet keine still übernommene Musterprämie.
- [ ] Doppelte Einreichung erzeugt keinen zweiten Antrag.
- [ ] Veraltete Daten, offene Pflichtprüfung und fehlende Rolle verhindern unzulässige Übergänge.

### APP-05 – Demo-Portal, Police und gemeinsames Dossier

P0 · geplant · 2 Personenstunden · G4

**Ergebnis:** Wiederaufnehmbarer Portalstand mit HTML-/JSON-Dossier.

**Abhängigkeiten:** APP-04

**Abnahme:**

- [ ] Demo-Police erst nach passender protokollierter Demo-Annahme.
- [ ] Dossier und UI teilen Werte, Versionen und Prüfstatus.
- [ ] Dokumentdownload ist fallbezogen geschützt.

### APP-06 – Sicherheits- und Auditschutz nachweisen

P0 · geplant · 2.5 Personenstunden · G5

**Ergebnis:** Sitzungs-/Rollenprüfung, Verschlüsselungsnachweis, Redaction und Ereignisverlauf.

**Abhängigkeiten:** APP-01, APP-02

**Abnahme:**

- [ ] Kein fremder Fall oder fremder Export über manipulierte IDs erreichbar.
- [ ] Keine realen Tokens im Bundle/Git/Export; notwendige Verschlüsselung tatsächlich eingerichtet.
- [ ] Auditereignisse dokumentieren Statusversionen ohne vertrauliche Rohpayloads.

### APP-07 – Reproduzierbaren Start und Demo-Konfiguration übergeben

P0 · geplant · 1 Personenstunden · G6

**Ergebnis:** Geprüfte lokale Start-/Migrations-/Seed-Schritte und Betriebsmodi.

**Abhängigkeiten:** APP-05, APP-06

**Abnahme:**

- [ ] Sauberer Start ohne manuell versteckte Datenbankkorrektur.
- [ ] Live-/Replay-/Fallback- und Demo-Sales-Modi unterscheiden sich sichtbar.
- [ ] Keine neue Cloudbereitstellung oder Providerberechtigung still vorausgesetzt.


## Person 5 – Fachprüfung / Integration

### QA-01 – Scope, Fixture und Abnahmekriterien festlegen

P0 · geplant · 2 Personenstunden · G0

**Ergebnis:** Eine vollständige synthetische Hauptfixture und geordnete Quellenklassen.

**Abhängigkeiten:** keine

**Abnahme:**

- [ ] Öffentliche Testfamilie, Müller-Quelle und Musteranalysen getrennt.
- [ ] Zusätzliche Ziele/Budgetwerte als eigene synthetische Schicht.
- [ ] Owner und P0-Nachweise von allen fünf Personen verstanden.

### QA-02 – Produkt- und Fachquellen für den kleinen Katalog aufbereiten

P0 · geplant · 2 Personenstunden · G2

**Ergebnis:** Kuratiertes Faktenpaket mit Dokument-/Abschnittsbezug und offenen Versionsfragen.

**Abhängigkeiten:** QA-01

**Abnahme:**

- [ ] Garantie, Projektion, Kosten, Rückkauf und Deckungsursachen getrennt.
- [ ] Keine Behauptung vollständiger Prüfung aller archivierten PDFs/Videos.
- [ ] Nur nachvollziehbare Fakten gehen an AI-/Produktregeln.

### QA-03 – Frühe Pax-Abstimmung und Entscheidungslog

P0 · geplant · 1.5 Personenstunden · G3

**Ergebnis:** Priorisierte Klärung von Integrations-, Modell-, Paket- und Fachblockern.

**Abhängigkeiten:** QA-01

**Abnahme:**

- [ ] Tatsächliche Expertenantwort oder weiterhin offener Punkt wird korrekt dokumentiert.
- [ ] Demo-Sales-Umfang und Risiko-Code haben nachvollziehbare Entscheidungen.
- [ ] Keine Nachricht oder Terminbuchung ohne entsprechenden Auftrag versendet.

### QA-04 – Abnahmedatensätze und Testdurchlauf vorbereiten

P0 · geplant · 2.5 Personenstunden · G2

**Ergebnis:** Grenzfälle, geeignete Browserpfade und messbare Abnahmecheckliste.

**Abhängigkeiten:** QA-01, CAL-01

**Abnahme:**

- [ ] Fachliche Annahmen und technische Beispiele werden nicht gleichgesetzt.
- [ ] Unbekannt, Negativbudget, Kapitaldoppelverwendung und veraltete Version enthalten.
- [ ] Ein kompletter Journey-Pfad und sinnvolle negative Pfade sind vorbereitet.

### QA-05 – Gemeinsamen Gesamtfluss und drei Szenarien abnehmen

P0 · geplant · 3 Personenstunden · G5

**Ergebnis:** Dokumentierter integrierter Testlauf auf einer frischen Sitzung.

**Abhängigkeiten:** UX-04, UX-05, CAL-08, AI-07, APP-05

**Abnahme:**

- [ ] Drei Pflichtszenarien und echter AI-Aufruf im selben Fall.
- [ ] Empfehlung, Dossier und Journey verwenden aktuelle Daten.
- [ ] Alle offenen Kernpunkte stehen sichtbar im Freigabestand.

### QA-06 – Pitch, Demoablauf und Übergabeunterlagen

P0 · geplant · 2 Personenstunden · G6

**Ergebnis:** Wiederholbarer Drei-Minuten-Durchlauf mit ehrlichem Backup.

**Abhängigkeiten:** QA-05, APP-07

**Abnahme:**

- [ ] Zusätzlicher Nutzen gegenüber öffentlicher Pax/vlot-Analyse klar.
- [ ] Eine neue Änderung wird wirklich verarbeitet und berechnet.
- [ ] Keine echte Versicherungsdeckung oder vollständige Compliance behauptet.

### QA-07 – Negative Sicherheits- und Datenschutzprüfung

P0 · geplant · 2 Personenstunden · G5

**Ergebnis:** Unabhängiger Gegencheck von Rollen, Export und Datenwegen.

**Abhängigkeiten:** APP-06, AI-07

**Abnahme:**

- [ ] Zweiter Browser kann ersten Fall nicht lesen, ändern oder exportieren.
- [ ] Modell-/Log-Kontext und Bundle enthalten keine unnötigen Daten oder Schlüssel.
- [ ] Sicherheitsfehler werden vor P1-Gestaltung priorisiert.

## Was nicht in diese Schätzung eingerechnet ist

Produktiver Rechts-/Sicherheitsfreigabeprozess, echte Annahme und Policenausstellung, vollständige schweizweite Vorsorge-/Hypothekenmodellierung, Voice/Avatar, allgemeine Dokument-OCR und mehrsprachige Fachvalidierung. Diese Arbeit gehört in die abgestimmte PoC-Fortsetzung und wird nicht durch Demo-Kennzeichen als erledigt erklärt.
