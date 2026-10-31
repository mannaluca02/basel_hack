# Pax LifeMap – detaillierter Umsetzungsplan für fünf Personen

**Stand: 31.10.2026, Europe/Zurich · Workshop-Fassung 2.0.** Planungsgrundlage für einen funktionierenden BaselHack-Prototyp. Angular ist die ausdrückliche Stack-Entscheidung des Teams. Dieses Dokument beschreibt die Zielarchitektur. Der erste Logik-Backend-Baustein ist inzwischen implementiert; der [Implementierungsbericht](../reports/logic-backend-implementation.md) trennt vorhandenen Code von weiterer Integrationsarbeit. Für die bereits umgesetzten DTOs sind die [Laufzeitschemas](../../../code/packages/contracts/src/index.ts) maßgeblich. Die Recherche, die archivierten API-Beispiele und der öffentliche Pax/vlot-Test existieren bereits.

### Inhaltsverzeichnis

- [0. So benutzt ihr diesen Plan](#0-so-benutzt-ihr-diesen-plan)
- [1. Was ihr baut und warum es gewinnen kann](#1-was-ihr-baut-und-warum-es-gewinnen-kann)
- [2. Verbindlicher Umfang und sinnvolle Begrenzungen](#2-verbindlicher-umfang-und-sinnvolle-begrenzungen)
- [3. Die ersten Entscheidungen und Prüfpunkte](#3-die-ersten-entscheidungen-und-prüfpunkte)
- [4. Referenzfälle, Demo-Daten und fachliche Wahrheit](#4-referenzfälle-demo-daten-und-fachliche-wahrheit)
- [5. Workshop-UI: eine Dynamic View, fünf Ansichten](#5-workshop-ui-eine-dynamic-view-fünf-ansichten)
- [6. Angular und Pax UI konkret einsetzen](#6-angular-und-pax-ui-konkret-einsetzen)
- [7. Backend-Architektur und Workshop-Workflow](#7-backend-architektur-und-workshop-workflow)
- [8. Gemeinsamer Datenvertrag](#8-gemeinsamer-datenvertrag)
- [9. Finanzielle Logik: ein Haushalt, mehrere Sichten](#9-finanzielle-logik-ein-haushalt-mehrere-sichten)
- [10. Szenario-Engine und Zeitachse](#10-szenario-engine-und-zeitachse)
- [11. Logismata-Integration mit tatsächlichen Operationen](#11-logismata-integration-mit-tatsächlichen-operationen)
- [12. AI Advisor: konkrete Aufgaben und Grenzen](#12-ai-advisor-konkrete-aufgaben-und-grenzen)
- [13. Handlungsoptionen und Pax-Produktregeln](#13-handlungsoptionen-und-pax-produktregeln)
- [14. Persönliche Angemessenheit und menschliche Prüfung](#14-persönliche-angemessenheit-und-menschliche-prüfung)
- [15. End-to-End: Offerte, Antrag und Demo-Police](#15-end-to-end-offerte-antrag-und-demo-police)
- [16. Workshop-Schnittstellen und eigene API-Verträge](#16-workshop-schnittstellen-und-eigene-api-verträge)
- [17. Persistenz, Versionierung und zuverlässige Wiederaufnahme](#17-persistenz-versionierung-und-zuverlässige-wiederaufnahme)
- [18. Datenschutz und Sicherheit vom ersten Slice an](#18-datenschutz-und-sicherheit-vom-ersten-slice-an)
- [19. Dossier, Audit und nachvollziehbare Entscheidungen](#19-dossier-audit-und-nachvollziehbare-entscheidungen)
- [20. Teststrategie und verbindliche Abnahmematrix](#20-teststrategie-und-verbindliche-abnahmematrix)
- [21. Messung, NPS und Produktmanagement](#21-messung-nps-und-produktmanagement)
- [22. Zusammenarbeit der fünf Personen](#22-zusammenarbeit-der-fünf-personen)
- [23. Integration nach dem Workshop und Zeitgrenzen](#23-integration-nach-dem-workshop-und-zeitgrenzen)
- [24. Früh an Cem und Claude gerichtete Fragen](#24-früh-an-cem-und-claude-gerichtete-fragen)
- [25. Demo, Pitch und nachvollziehbarer Funktionsnachweis](#25-demo-pitch-und-nachvollziehbarer-funktionsnachweis)
- [26. Von der Hackathon-Demo zum gemeinsam entwickelten PoC](#26-von-der-hackathon-demo-zum-gemeinsam-entwickelten-poc)
- [27. Die nächsten 90 Minuten nach Übernahme des Workshops](#27-die-nächsten-90-minuten-nach-übernahme-des-workshops)
- [28. Quellen und Verbindlichkeit](#28-quellen-und-verbindlichkeit)

Die [Workshop-Entscheide](workshop-decisions.md) aus `IMG_7232.HEIC` und die anschließende Nutzerbestätigung haben Vorrang vor der früheren UI-/Rollenskizze. Bestätigt sind **Luca: UI, Lukas: Avatar, Dario: Voice, Valentin: Logik-Backend, Earnie: KI-Backend** sowie **Fortschritt direkt am Agenten**. Lesbare Board-Inhalte und weitergehende Umsetzungsvorschläge sind im Entscheidungsdokument getrennt.

## 0. So benutzt ihr diesen Plan

Dieses Dokument ist die konkrete Bauanleitung. Der [bisherige Gesamtplan](advisor-plan.md) enthält die ausführliche fachliche Recherche; der [Teamplan](team-plan.md) bleibt die kurze Rollenübersicht. Das ergänzende [Ticket-Backlog](implementation-backlog.md) zerlegt diesen Plan in einzeln abnehmbare Arbeitspakete. Seine [JSON-Fassung](../catalog/implementation-backlog.json) kann später für ein Issue-Board verwendet werden; es wurden keine GitHub-Issues angelegt.

Vier Kennzeichnungen gelten im gesamten Dokument:

| Kennzeichnung | Bedeutung |
|---|---|
| **Verifiziert** | Durch lokale Quellen, archivierte API-Antworten oder den dokumentierten UI-Test belegt; keine umfassende fachliche Freigabe |
| **Entschieden** | Konkrete Vorgabe dieses Plans bzw. ausdrückliche Teamvorgabe |
| **Demo-Annahme** | Bewusst vereinfachter, sichtbarer Parameter; keine Aussage über Gesetz, Pax-Tarif oder Kreditentscheidung |
| **Mit Pax klären** | Für verlässliche Fach- oder Produktionsaussagen ist eine Bestätigung erforderlich |

Die fachlichen Anforderungen an drei Säulen, Szenarien, nachvollziehbare Empfehlung und den Demo-Vertragsweg bleiben bestehen. Neue UI: grafikzentrierte Dynamic View mit Progress / Graphics / Chat / Info / Summary, Zeitbudget-Opener, Agent-/Voice-Kanal, Kontext-Erklärung und Summary-Sichten. Der Video-Avatar bleibt ausdrücklich Nice-to-have.

Ein geschätzter Wert kann vom Benutzer bestätigt werden, ohne dadurch zu einem dokumentarisch belegten Wert zu werden. „Bekannt“, „bestätigt“ und „fachlich geprüft“ sind unterschiedliche Eigenschaften.

**Planungsfenster:** weiterhin vorläufig 48 Stunden für die gesamte Veranstaltung, nicht weitere 48 Stunden ab dem Workshop. Die tatsächliche Restzeit und außerhalb dieses Repos bereits erledigte Umsetzung sind nicht bekannt. Die tatsächlichen Veranstaltungszeiten wurden nicht verifiziert. Gerechnet wird mit insgesamt ungefähr 110 produktiven Personenstunden inklusive gemeinsamer Abstimmung und Puffer; ausdrücklich nicht mit fünf Personen, die 48 Stunden durchgehend arbeiten.

## 1. Was ihr baut und warum es gewinnen kann

### 1.1 Produktversprechen

LifeMap beantwortet drei Fragen in dieser Reihenfolge:

1. Was ist uns im Leben wichtig, und was können wir uns nachhaltig leisten?
2. Wie verändern Familie, Arbeit, Eigenheim und Pensionierung unsere Versorgung über die Zeit?
3. Welche nächsten Schritte helfen tatsächlich – und welche Pax-Lösung passt gegebenenfalls dazu?

Das sichtbare Produkt ist eine interaktive Lebenskarte. Ein AI Advisor unterstützt die Erfassung und Erklärung. Der Gesprächsverlauf allein ist weder Datenbank noch Berechnungsmodell noch Entscheidungsbegründung.

**Der entscheidende Demo-Moment:** Eine Änderung des Arbeitspensums aktualisiert Budget und bekannte Vorsorgefolgen. Beim Eigenheimvergleich sieht die Familie, welches Geld anschließend nicht mehr für Rücklagen oder Pensionierung verfügbar ist. Die spätere Empfehlung lässt sich auf genau diese Szenarioversion zurückführen. Derselbe gespeicherte Fall läuft anschließend bis zur ausdrücklich simulierten Police im Demo-Portal.

### 1.2 Die aktuelle öffentliche Lösung ernst nehmen

Der [öffentliche Referenztest](../reports/public-pension-analysis.md) ist eine belegte Ausgangsbasis. Die getestete vlot-Version `vlot-261023-154824-e7a954-86861-26.10-4` bietet bereits Haushaltsdaten, Pensionskassenangaben, dritte Säule, Steuerbetrachtung, Risikoprioritäten, eine Rentenzeitachse und PDF-Export. Vier Sprachen waren im Menü sichtbar; getestet wurde DE.

| Bereits beobachtet | Geplanter Zusatznutzen von LifeMap | Konkreter Demo-Nachweis |
|---|---|---|
| Geführte Formularstrecke | Gespräch und kompakte Formulare bearbeiten dasselbe bestätigte Profil | Eine Gesprächsangabe erscheint als noch zu bestätigender Feldvorschlag |
| Aktuelle Haushaltssituation | Explizite Lebensziele und datierte Veränderungen | Ziel „Eigenheim“ ist mit Zeitpunkt, Kapitalbedarf und Priorität gespeichert |
| Lückenübersicht und Rentenphasen | Vergleich mehrerer Zukunftsvarianten auf derselben Ausgangsversion | Vorher/Nachher mit Annahmen und betroffenen Zeitabschnitten |
| Darstellung mehrerer Säulen | Verknüpfte Kapital- und Budgetplanung ohne Mehrfachverwendung | Für das Eigenheim reserviertes Kapital wird nicht gleichzeitig als frei verfügbar gezeigt |
| Ergebnis- und Lösungsansichten | Durchgängige Begründung aus einer gemeinsamen Ergebnisversion | Dieselbe Lücke und derselbe Prüfstatus in Grafik, Empfehlung und Dossier |
| PDF-Auswertung | Wiederaufnehmbarer Beratungsfall bis zur Demo-Police | Browser neu laden; Status, Offerte und Demo-Dokument bleiben vorhanden |

Nicht behaupten, dass Pax noch gar keine digitale Vorsorgeanalyse hat. Nicht behaupten, dass im öffentlichen Angebot jede hier gewünschte Funktion fehlt: Der Test deckte einen Familienpfad ab und war keine vollständige Produktprüfung.

### 1.3 Erfolgskriterien für den Prototyp

Die folgenden Werte sind Teamziele und keine bereits gemessenen Ergebnisse:

- Ein vorbereiteter Demo-Fall durchläuft alle Pflichtstationen ohne Eingaben erneut abzutippen.
- Alle drei Pflichtszenarien ändern gespeicherte Eingaben und erzeugen neue berechnete Ergebnisse; keine rein dekorativen Schieberegler.
- Mindestens ein freigegebener Modellaufruf verarbeitet neue Benutzereingaben tatsächlich. Eine ausschließlich vorgefertigte Antwortfolge genügt nicht als AI-Prototyp.
- Mindestens ein sinnvoller Rechenpfad nutzt bei verfügbarem Zugang Logismata live. Aufgezeichnete Antworten bleiben als Replay gekennzeichnet.
- Jeder sichtbare Geldwert besitzt Einheit, Datenstand und Herkunft. Unbekannte Beträge erscheinen nicht als CHF 0.
- Der Kunde kann sich vor der Produktauswahl für „zuerst Daten vervollständigen“ oder „menschlich prüfen lassen“ entscheiden.
- Ein zusätzlicher Testbrowser kann nicht auf den Fall des ersten Browsers zugreifen.
- Eine nachträgliche Profiländerung macht alte Ergebnisse und darauf beruhende Offerten sichtbar veraltet.
- Es werden ausschließlich synthetische Demo-Daten verarbeitet, bis eine weitergehende Datenverarbeitung ausdrücklich mit Pax geregelt ist.

## 2. Verbindlicher Umfang und sinnvolle Begrenzungen

### 2.1 P0 – muss in der gemeinsamen Demo funktionieren

| Bereich | Kleinster vollständiger Umfang | Was ausdrücklich sichtbar bleibt |
|---|---|---|
| Workspace | Dynamic View und genau fünf primäre Tabs; ein gemeinsamer Fall-/Auswahlkontext | Grafik als Hauptfläche, Produktbereich nach Bedarfsreife |
| Zeitbudget | Opener und gespeicherter Gesprächsdetailgrad | Keine verkürzte Pflichtprüfung bei kurzem Modus |
| Agent und Progress | Einfache zustandsabhängige Darstellung mit Ring/Farbe und Text | Fortschritt ist keine Risikoeinstufung oder Versicherungsdeckung |
| Voice | Dünner freigegebener Spracheingabe-/Ausgabepfad als Umsetzungsvorschlag zum bestätigten Bereich | Textfallback und Datenschutz-/Browsergrenzen |
| Summary-Übergabe | Kunden-/Fachpersonensicht desselben Snapshots | Export/Download statt automatischer Mail oder Terminbuchung |
| Zugang und Transparenz | Geschützter Demo-Einstieg, eigener Fall pro Sitzung, Sprache DE, verständliche Dateninformation | Demo-Modus, AI-Einsatz und Verarbeitungswege |
| Bedarf | Haushalt, Ziele, Einkommen, Ausgaben, Vermögen, Schulden und Prioritäten | Noch fehlende oder nur geschätzte Angaben |
| Drei Säulen | AHV/IV-Ergebnisse, PK-Leistungen, 3a/3b und bestehende Deckungen | Quelle, Schätzung, Alter des Dokuments, Rechenstand |
| LifeMap | Zeitachse und Tabelle mit ausgewählten Lebensereignissen | Bestätigte Daten getrennt von geplanten Veränderungen |
| Familie | Ein datiertes Pensums-/Betreuungsereignis mit neuem Budget und erneuter Vorsorgeberechnung bzw. ausgewiesener Fachlücke | Nicht automatisch bekannte künftige PK-Leistungen |
| Eigenheim | Eigenmittel, gebundene Mittel, Reserve und vereinfachter Budgetvergleich | Annahmen, fehlende Bank-/Vorsorgefreigaben, keine Kreditzusage |
| Pensionierung | Getrennte Pensionierungszeitpunkte, Übergangsphase und Kapitalverzehr | Nicht dokumentierte AHV-/PK-Bezugsregeln und Prognoserisiko |
| AI | Feldvorschläge, priorisierte Rückfragen und Erklärung vorhandener Ergebnisse | Keine selbst erfundenen Berechnungen oder Preise |
| Empfehlung | Handlungsstrategie vor Produkt, maximal wenige passende Produktfamilien, begründete Alternative | Fachliche Vorbehalte und fehlende Angemessenheitsangaben |
| End-to-End | Gespeicherte Demo-Offerte, Demo-Antrag, manueller Demo-Prüfschritt und Demo-Police | Keine echte Signatur, Annahme oder Versicherungsdeckung |
| Audit und Qualität | Eingabeversion, Rechenversion, Produkt-/Regelversion und Begründung | Unterschied zwischen Rechenergebnis, Vorschlag und Freigabe |

Eine simulierte Sales-Anbindung ist ein funktionsfähiger eigener Ablauf mit echten gespeicherten Statusübergängen. Sie ist kein Beleg für eine freigegebene Pax-Vertriebsschnittstelle. Die Akzeptanz dieses Demo-Umfangs wird früh mit den Pax-Experten abgeglichen.

### 2.2 P1 – nach dem vollständigen Hauptpfad

**Video-Avatar** ist auf dem Board ausdrücklich Nice-to-have. Zusätzlich: die eingeklammerte Follow-up-/Overview-Idee als erweiterte Fallübersicht, weitere geprüfte Sprachen, synthetischer PK-Import und serverseitiger PDF-Export. Weder Video noch eine unbestimmte Follow-up-Funktion blockieren den grundlegenden Agenten, Voice, Summary oder den gespeicherten Demo-Portalstatus.

### 2.3 P2 – erst danach

Dark Mode ist nur eine Interpretation des Mondsymbols. Weitere Spezialfälle, aufwendige 3D-/Avatarproduktion, fortgeschrittenes Vollduplex-Voice, umfangreiche OCR und ein vollwertiges CRM sind spätere Erweiterungen. Kein Kernvergleich oder Daten-/Exportfehler wird dafür zurückgestellt.

### 2.4 Ehrliche Betriebsarten

| Modus | Berechnung | AI | Offerte/Antrag/Police |
|---|---|---|---|
| `live-demo` | Freigegebene Logismata-Aufrufe und ausgewiesene Szenariomodelle | Tatsächliches, freigegebenes Modell mit synthetischem Kontext | Eigener Demo-Adapter |
| `illustrative-demo` | Eigenes deterministisches Cashflow-/Kapitalmodell auf bestätigten Demo-Annahmen; unverändert übernommene Baseline-Leistungen gesondert markiert | Tatsächliches freigegebenes Modell, soweit verfügbar | Eigener Demo-Adapter |
| `replay-demo` | Exakt zum Eingabe-Hash passende aufgezeichnete Antwort; sonst keine vermeintlich passende Zahl | Modell kann weiter funktionieren | Eigener Demo-Adapter |
| `guided-fallback` | Formulare und bekannte Ergebnisse bleiben nutzbar | Vorlagen bei Modellfehler | Eigener Demo-Adapter |

Der Fallback hält die App bedienbar, erfüllt für sich genommen aber nicht den Anspruch eines funktionierenden AI Advisors. Live-, Replay- und Demo-Bezeichnungen werden am betreffenden Ergebnis angezeigt, nicht nur in der technischen README.

Im illustrativen Modus verändern neue Eingaben tatsächlich Budget, Kapitalzuordnung und Entnahmeverlauf. Nicht unterstützte AHV-/PK-Folgen werden als unbekannt bzw. unverändert übernommene Baseline ausgewiesen, niemals als neu geprüfte Versicherungsleistung. Damit bleibt ein begrenzter Vergleich bei API-Ausfall nutzbar. Seine reduzierte Aussagekraft und gegebenenfalls gesperrte verbindliche Empfehlung sind sichtbar.

## 3. Die ersten Entscheidungen und Prüfpunkte

| Entscheidung | Vorgabe | Noch erforderlicher Nachweis | Zuständig / spätestens |
|---|---|---|---|
| Frontend | Angular, Standalone Components, Reactive Forms | Minimalansicht baut und rendert einen Pax-Button sowie ein Formularfeld | Luca / T+2 h |
| Pax UI | `@paxch/pax-ui` bevorzugt | Autorisierter Registry-Zugang und tatsächlich passende Peer Dependencies | Luca / T+2 h |
| Angular-Version | Zur Pax-Bibliothek passende unterstützte Version; archivierte Anleitung nennt 19/20 | Reale Paket-Metadaten und Angular-Kompatibilität abgleichen; keine erzwungenen Peer Dependencies | Luca + Earnie / T+2 h |
| Backend | NestJS mit TypeScript, ein modularer Prozess | Geschützter Health-/Case-Pfad und gemeinsame DTO-Validierung | Earnie / T+4 h |
| Persistenz | PostgreSQL mit klarer Repository-Schicht; Prisma als vorgeschlagener ORM | Migration und reproduzierbarer Testdatensatz laufen | Earnie / T+4 h |
| Agent und Voice | Zustands- und Turn-Vertrag, freigegebener STT-/TTS-Pfad | Kein Kamera-Zwang, keine ungeklärte Browser-Cloud; Mikrofon erst nach Nutzeraktion | Lukas + Dario + Earnie / erstes Integrationstor |
| AI-Umgebung | Zuerst freigegebenes lokales oder von Pax freigegebenes Modell | Echter Aufruf mit Schemaausgabe; zulässige Datenwege dokumentiert | Earnie / T+4 h |
| Rechenbackend | Logismata-Adapter | Zugang, Antwortschema und mindestens ein geeigneter Live-Lauf | Valentin / T+4 h |
| Sales-Integration | Demo-Adapter ist die voreingestellte Ausführung | Sponsor akzeptiert den abgegrenzten End-to-End-Demonstrator | das Team / erster Expertentermin |
| Referenzdaten | Öffentliche Testfamilie und Pax-Material bleiben getrennte Datensätze | Quellen-/Synthetic-Kennzeichnung und kein Vermischen der Zahlen | das Team / T+2 h |

Fehlt der Pax-Paketzugriff, bleibt Angular gesetzt. Luca baut wenige eigene zugängliche Komponenten mit den dokumentierten Markenfarben hinter denselben App-Komponentenschnittstellen. Kein anderer Stackwechsel und kein Kopieren des heruntergeladenen vlot-Frontends. Das Hindernis wird an Pax gemeldet, ohne die übrigen Spuren anzuhalten.

Fehlt ein zulässiges funktionsfähiges Modell, ist das ein echter offener P0-Punkt. Eine animierte Chat-Blase oder ein allgemeines Regelwerk wird nicht als LLM ausgegeben.

## 4. Referenzfälle, Demo-Daten und fachliche Wahrheit

### 4.1 Vier getrennte Datensätze

| ID | Inhalt | Zulässige Verwendung | Unzulässige Schlussfolgerung |
|---|---|---|---|
| `mueller-source` | Angaben aus dem bereitgestellten Persona-PDF, einschließlich der offenen Brutto-/Nettofrage | Zielgruppenverständnis und Besprechung mit Pax | Fehlende PK-/Budgetwerte als angebliche Originalangaben ergänzen |
| `pax-reference-checks` | Unveränderte Einzel-/Paar-Vorsorgechecks mit dokumentierten Annahmen | Fachliche Referenz ausgewählter Phasen und Darstellungen | Alte Musterwerte ohne identische Annahmen als aktuelle API-Sollwerte erzwingen |
| `public-family-synthetic-v1` | TEST Nina, TEST Tom und zwei Kinder aus dem öffentlichen UI-Test | Erster funktionierender Entwicklungs- und Demo-Fall | vlot-Zahlen als fachlich identische Logismata-Ausgabe behandeln |
| `edge-cases-v1` | Unabhängig erfundene Grenzfälle | Validierung von Unbekannt, Liquiditätsmangel, Fehlern und Übergabe | Aus einem grünen UI-Test eine allgemeine Fachfreigabe ableiten |

**Konkrete Priorisierung gegenüber dem Grobplan:** Der erste vollständige App-Durchlauf verwendet Nina/Tom, weil dafür bereits reproduzierbare Eingaben und ein 17-seitiger öffentlicher Referenzexport existieren. Die Müller-Persona bleibt Zielgruppen- und Fachreferenz. Eine darauf beruhende Demo-Version wird erst ergänzt, wenn ihre offenen Angaben einzeln als synthetisch oder belegt erfasst sind. So entsteht keine zweite unvollständige Hauptgeschichte.

### 4.2 Unveränderte Basis der synthetischen Testfamilie

Die [vorhandene JSON-Datei](../references/public-pension-analysis/inputs/fictitious-family.json) ist die Quelle: verheiratet seit 2018, Basel 4051, zwei Kinder, Jahreseinkommen CHF 100’000 und CHF 60’000, Miete CHF 2’400 monatlich, ein 3a-Konto mit CHF 20’000 und CHF 5’000 jährlicher Einzahlung. Ninas PK-Leistungen sind erfundene manuelle Werte; für Tom wurde im öffentlichen Test ausdrücklich die BVG-Minimalschätzung gewählt.

Für LifeMap werden **zusätzliche** Ziele, Ausgaben, ein freier Vermögenswert und Arbeitspensen benötigt. Diese landen in einer separaten Fixture-Schicht `lifemap-family-additions-v1` mit `origin=synthetic`. Keine dieser Ergänzungen wird nachträglich als im öffentlichen Test eingegeben dargestellt.

Vorgeschlagene vollständig synthetische Ergänzungen: frei verfügbare Ersparnisse CHF 25’000, Liquiditätsreserve CHF 15’000, gewünschter Hauskauf in fünf Jahren, frei wählbare Betreuungs-/Pensumsvariante und vollständige Beispiel-Ausgabenkategorien. Beträge werden vor dem ersten Demo-Run gemeinsam festgelegt; bis dahin steht die Reife des neuen Haushaltsbudgets auf unvollständig.

### 4.3 Was fachlich als geprüft gilt

Ein Rechenfall besitzt vier getrennte Nachweise: Datenherkunft, technische Schema-/Einheitenprüfung, fachliche Prüfung der Annahmen und Freigabestatus der Empfehlung. Die Demo darf mit einer bestätigten Schätzung rechnen. Sie darf diese dadurch nicht zu einem verbindlichen Leistungsversprechen hochstufen.

## 5. Workshop-UI: eine Dynamic View, fünf Ansichten

### 5.1 Verbindlicher Zuschnitt und gemeinsame Oberfläche

Die Workshop-Skizze ersetzt die frühere chatlastige Dreispaltenidee. Die **Dynamic View mit Zeitachse und Grafik ist die Hauptfläche**. Der Agent ist dauerhaft erreichbar und trägt den bestätigten Fortschrittsring. Die primären Ansichten heißen exakt **Progress, Graphics, Chat, Info, Summary**.

Desktop: große Grafik-/Arbeitsfläche, schmale Agent-/Navigationsleiste und bei reifem Bedarf eine ergänzende Produktfläche. Auf schmalen Geräten wird daraus eine einzelne Hauptfläche mit erreichbarer Tab-/Agentsteuerung; Produkte/Details öffnen sich bedarfsbezogen. Der Avatar kann entsprechend der zweiten Skizze unterhalb der Grafik liegen. Exakte Pixelmaße und Breakpoints sind Umsetzungsvorschläge von Luca/Lukas, keine aus dem Foto herausgelesenen Vorgaben.

Gemeinsamer Kopf: Fall, Sprache, Daten-/Ergebnisversion, letzter Speicherstand und Demo-Markierung. Gemeinsamer Kontext: Person, Szenario, gewählter Zeitraum und Rechenlauf. Ein Tabwechsel erzeugt weder einen neuen Fall noch ein zweites Chatprofil. Eine neue Produktempfehlung erscheint erst nach Bedarfs- und Tragbarkeitserfassung; eine sichtbare Produktfläche ist keine Erlaubnis für Product-first-Selling.

### 5.2 Die fünf Ansichten konkret

| Ansicht | Inhalt | Eingaben/Aktionen | Verbindliche Regel |
|---|---|---|---|
| **Progress** | Erledigte Datengruppen, offene Fragen, Schätzungen, nächste sinnvolle Aufgabe | Fehlende Angabe öffnen; Daten prüfen; Erklärungstiefe ändern | Derselbe Fortschritt wie am Agenten; keine Gleichsetzung mit Versicherungsbedarf |
| **Graphics** | Dynamische Zeitachse, Säulen, Versorgung/Kapital, Vorher-/Nachher und lesbare Tabelle | Person, Ereignis, Szenario, Periode/Kennzahl wählen; „Diese Stelle erklären“ | Auswahl ist an Profil-/Szenario-/Run-Version gebunden |
| **Chat** | Bestätigbare Feldvorschläge, Rückfragen, Erklärungen; Voice-Transkript | Schreiben, Transkript korrigieren, bestätigen, sprechen/stoppen | Text und Sprache sind Kanäle desselben Advisors; keine Schatten-Datenbank |
| **Info** | Bedeutung der gewählten Kennzahl, Annahmen, Datenherkunft, Grenzen und gegebenenfalls Produktfakten | Quelle öffnen; Begriff erklären lassen; offene Prüfung ansehen | Fachliche Information vor Verkauf; keine erfundenen Leistungsbedingungen |
| **Summary** | Ziele, bestätigtes Profil, drei Säulen, Szenariowahl, Maßnahmen, offene Fragen und Demo-Journey | Eigene/Fachperson-Sicht exportieren; nächsten Schritt wählen | Beide Sichten beruhen auf demselben Snapshot; Export ist kein Versand |

Die „Risk“-Notiz und gezeichneten Zahlen werden als Hinweis auf eine mögliche Kontextanzeige behandelt. Sie definieren keinen sechsten Tab und keinen beschlossenen Risiko-Score. Schraffuren und Farben erhalten eine geprüfte Legende; ihre finanzielle Bedeutung wird nicht aus einem Stiftstrich erfunden.

### 5.3 Einstieg: „Wie viel Zeit hast du?“

Nach dem notwendigen Daten-/AI-Hinweis begrüßt der Agent die Person und fragt nach verfügbarer Zeit. Ein vorgeschlagener UI-Entwurf bietet kurz, normal und ausführlich bzw. einen frei bestätigten Minutenwert; konkrete Werte wurden im Workshop nicht festgelegt. Gespeichert werden `timeBudgetMinutes`, `interactionDepth` und die Herkunft dieser Auswahl.

Kurz bedeutet: eine priorisierte nächste Frage, knappe Erklärung und bewusst angebotene Vertiefung. Ausführlich bedeutet: mehr Begründung, Annahmen und Vergleiche. **Weder Datenqualität noch Pflichtfragen noch menschliche Prüfung werden durch einen kurzen Modus abgeschaltet.** Ein Zeitbudget ist kein Countdown, der zum Vertragsabschluss drängt. Der Benutzer kann den Modus jederzeit ändern.

Eine gesprochene Eröffnung setzt eine bewusste Audioaktivierung und einen freigegebenen Sprachweg voraus. Text bleibt immer nutzbar. Der feste Opener ist kein Beleg für AI; mindestens die anschließende neue Eingabe muss tatsächlich verarbeitet werden.

### 5.4 Fachliche Schritte innerhalb des Workspaces

Die bisherigen S01–S16 bleiben als fachliche Aufgaben erhalten. Sie werden nicht zu 16 zusätzlichen Haupt-Tabs oder einer vom Workshop abweichenden Wizard-App.

| Schritt | Ort im Workspace | Gespeichertes Ergebnis | Kritischer Leer-/Fehlerzustand |
|---|---|---|---|
| S01 Einstieg | Agent + kurzer Hinweis/Opener | Eigene Sitzung, Sprache, Zeitbudget, Demo-Modus | Kein verstecktes Mikrofon oder geteilter Globalfall |
| S02 Ziele | Chat + Progress-Karte | Ziele, Zeitpunkte und Prioritäten | Produktvorschlag nicht als Ersatz für Ziele |
| S03 Haushalt | Bestätigbare Progress-Karte | Personen, Beziehung, Kinder, Erwerb, Betreuung | Partnerangaben unbekannt bleibt unbekannt |
| S04 Budget | Progress-/Graphics-Details | Einkommensbasis, Ausgaben, Reserve und Tragbarkeit | Netto-/Steuerdefinition unklar: nur Teilbild |
| S05 Versorgung | Progress + Info/Graphics | Drei Säulen, Deckungen, Quellen und Schätzstatus | Fehlender PK-Ausweis bleibt sichtbare Schätzung |
| S06 Profilprüfung | Progress + Summary-Vorschau | Neue bestätigte Profilversion | Keine Vollständigkeitsbehauptung bei offenem Widerspruch |
| S07 Baseline | Graphics | Passender Basislauf und Erklärkontext | Unbekannte Bereiche werden nicht ausgeblendet |
| S08 Familie | Szenariokarte in Graphics | Datierte Pensums-/Betreuungsvariante | Künftige PK-Folge nicht automatisch proportional |
| S09 Eigenheim | Szenariokarte in Graphics | Kapitalbindung und Budgetvergleich | Fehlende Eigenmittel bleiben Fehlbetrag |
| S10 Pensionierung | Szenariokarte in Graphics | Getrennte Übergangs-/Rentenphasen | Erwerbsende ist nicht automatisch Rentenbeginn |
| S11 Handlungsoptionen | Summary + erklärender Chat | Strategie und Gründe | Untragbare Verpflichtung nicht anbieten |
| S12 Produktbezug | Sekundäre Produktfläche + Info | Quellenbezogene Empfehlung oder Reviewgrund | Unklare Eignung blockiert Verbindlichkeit |
| S13 Demo-Offerte | Summary-Detail | Eigene Demo-Offertenversion | Musterpreis nicht als individueller Tarifpreis übernehmen |
| S14 Demo-Antrag | Summary-/Journey-Detail | Antrag und erforderliche Bestätigungen | Veraltete Offerte sperrt Einreichung |
| S15 Prüfung | Review-/Info-Detail | Menschlicher Prüfauftrag bzw. Demo-Reviewer-Entscheidung | AI erledigt erforderliches Review nicht selbst |
| S16 Demo-Portal | Summary-/Portal-Detail | Wiederaufnehmbarer Status, Demo-Police, Dossier | Eingereicht ist nicht angenommen oder versichert |

### 5.5 Genau die ausgewählte Grafikstelle erklären

„Diese Stelle erklären“ wird an einer Kennzahl, einer Periode, einer Person oder einem Ereignis angeboten. Bei „Das verstehe ich nicht“ ohne eindeutige Auswahl fragt der Agent kurz nach, statt sich irgendeinen Betrag auszusuchen.

```ts
type GraphContext = {
  caseId: string;
  profileVersion: number;
  scenarioVersionId: string;
  runId: string;
  graphId: string;
  metricId: string;
  personId?: string;
  periodStart: string;
  periodEnd?: string;
};
```

Der Client übergibt Identifikatoren, nicht eine frei erfundene Erklärung samt Betrag. Das Logik-Backend prüft, dass Kontext und berechtigter Fall zusammenpassen; das KI-Backend erhält die passenden strukturierten Ergebnisfakten. Die Erklärung nennt Bedeutung, betroffene Phase, Annahmen und Datenlücken. Sie wird in Chat/Info angezeigt und kann über den freigegebenen Voice-Kanal vorgelesen werden.

Ändert sich die Auswahl oder Version, wird eine verspätete Erklärung verworfen oder als historisch markiert. Eine noch laufende Audioausgabe zur alten Grafik wird gestoppt. Wiederholte Nachfragen führen zu verständlicherer Darstellung, nicht zu einer psychologischen Diagnose oder einem versteckten Kunden-Score.

### 5.6 Fortschritt direkt am Agenten

Der vom Nutzer bestätigte Ring/Farbzustand zeigt **Erfassungs- bzw. Beratungsfortschritt**, nicht Versicherbarkeit, Risikoklasse oder das Ende eines Vertragsprozesses. Mögliche Datengruppen: Ziele, Haushalt, Budget, erste/zweite/dritte Säule, Szenarioentscheidung und bestätigte offene Schritte. Die konkreten Gruppen/Weights sind ein gemeinsamer Fachvertrag, keine aus dem Foto abgeleiteten Prozentregeln.

Lukas rendert; Valentin definiert Datenreife; Earnie stellt den passenden Fallstand bereit. Ring und Progress-Tab verwenden dasselbe Objekt. Unbekannte Angaben erhöhen den bestätigten Vollständigkeitsgrad nicht. Hundert Prozent abgeschlossene Aufnahme kann mit „Fachprüfung offen“ oder „keine Police ausgestellt“ zusammen auftreten; dieser Unterschied bleibt im Text sichtbar.

Der Agent hat technische Zustände `idle`, `listening`, `thinking`, `speaking`, `error`. Farben werden durch Text und Symbole ergänzt. Ein grüner Ring bedeutet niemals „alle Risiken gelöst“. Eine Animation entscheidet weder fachlichen Status noch eine Annahme. Für das Grundmodell wird keine Kamera benötigt.

### 5.7 Summary für Kunde und Fachperson

Ein `SummaryBundle` referenziert eine einzige Profil-/Szenario-/Rechenversion, Ziele, Annahmen, Maßnahmen, Produkteignung, Alternativen und offene Prüfungen. Die Kundensicht ist verständlich formuliert. Die Fachpersonensicht ergänzt strukturierte Quellen, Rechen-/Regelreferenzen und präzise offene Aufgaben. Sie ist keine zweite unabhängig neu gerechnete Zusammenfassung.

Der Boardbegriff „Candidate“ wird vorläufig als Kunde/interessierte Person gelesen; genaue Benennung und tatsächlicher Übergabekanal bleiben offen. P0 bietet Download bzw. eine kontrollierte Übergabeansicht. Kein Klick auf „Export“ sendet ohne gesonderten Auftrag eine Mail, Nachricht oder Terminbuchung. Gemeinsamer Versionsbezug und Zugriffsschutz gelten auch für Downloads.

Beide Sichten sind als HTML/JSON nutzbar; PDF bleibt eine optionale Darstellungsverbesserung, weil der Workshop kein Format festlegt. Draft-/Schätz-/Reviewstatus wird nicht für eine schöner wirkende Kundensicht versteckt. Ein serverseitiger Versand oder echter Beraterzugang gehört erst in eine freigegebene Integration.

### 5.8 Weitere Skizzenpunkte und Fehlerzustände

Video-Avatar bleibt ausdrücklich Nice-to-have. Grundlegender Agent, Progress, Voice-/Text-Anschluss und Grafik-Erklärung dürfen nicht auf ihn warten. „Follow up / Overview“ in Klammern wird als vorläufige Erweiterung verstanden; notwendige Wiederaufnahme und Demo-Portalstatus bleiben P0. Das Mondsymbol ist nur eine mögliche Dark-Mode-Idee.

UI-Badges zeigen Speichern, Rechnen, offenes Review und Audiozustand verständlich. Bei denied permission, unverständlichem Transkript oder Video-/TTS-Ausfall bleibt Text bedienbar. Ein Browser-Reload aktiviert kein Mikrofon und startet keine alte Audioausgabe automatisch.

## 6. Angular und Pax UI konkret einsetzen

### 6.1 Installation zuerst als kleinen Nachweis lösen

Die archivierte [Pax-Installationsanleitung](../references/web/design/components/pax-ui-installation.txt) nennt Angular 19/20, eine GitHub Package Registry und nötigen Paket-Zugriff. Die [Getting-Started-Seite](../references/web/design/components/pax-ui-getting-started.txt) ist teilweise allgemeiner formuliert. Maßgeblich für die Installation sind die tatsächlich ausgelieferten Peer Dependencies, nicht eine vermutete Kompatibilität mit Angular 22.

Luca und Earnie prüfen in einer kleinen Testansicht: Paket importierbar, CSS geladen, Schrift-/Assetpfade korrekt, Button-Klick sichtbar, Formularfeld eingebunden, Produktion-Build erfolgreich. Erst danach entstehen die übrigen Screens. Die [offizielle Angular-Kompatibilitätstabelle](https://angular.dev/reference/versions) hilft beim passenden Node-/TypeScript-/RxJS-Satz; die genauen Versionen werden im Lockfile festgehalten.

Paket-Zugriff wird über den autorisierten Pax-Teamweg bezogen. Der Logismata-Bearer-Token ist kein Registry-Token. Eine `.npmrc` darf nur eine Umgebungsvariablen-Referenz enthalten, niemals einen echten Paket-Token. Kein `--force` oder `--legacy-peer-deps` als dauerhafte Konfliktlösung.

### 6.2 Frontend-Struktur

```text
code/
  apps/
    web/                         # Angular
      src/app/
        core/                    # Sitzung, API-Client, Fehlerbehandlung
        shared/ui/               # dünne App-Wrapper um Pax-Komponenten
        features/workspace/      # fünf Tabs und gemeinsamer Auswahlkontext
        features/agent/          # Lukas: Progress und Darstellungszustände
        features/voice/          # Dario: STT/TTS, Transcript und Lebenszyklus
        features/intake/
        features/household/
        features/lifemap/
        features/scenarios/
        features/recommendations/
        features/application/
        features/portal/
    api/                         # NestJS
  packages/
    contracts/                   # Schemas, DTOs, Status und Einheiten
    domain/                      # reine Fach-/Szenariofunktionen
    product-rules/               # versionierte Fakten und Regeln
  fixtures/                      # ausschließlich synthetische Entwicklerfälle
  tests/e2e/
  infra/                         # lokale Start-/Containerkonfiguration
```

Die Struktur ist die Zielaufteilung. Der erste API-/Contracts-/Domain-Code ist angelegt; weitere Verzeichnisse entstehen nach Bedarf. Bestehende Quellen unter `documentation/` und Markenassets unter `assets/` werden nicht in App-Quellcodeordner verschoben.

### 6.3 Zuständigkeiten im Client

- Reactive Forms halten editierbare Eingaben und Validierungsfehler; die [Angular-Dokumentation](https://angular.dev/guide/forms/reactive-forms) ist die technische Referenz.
- Signals halten aktuellen Fall, ausgewählte Szenarioversion und abgeleitete Darstellungszustände. Sie führen keine zweite unabhängige Versicherungsrechnung aus. Siehe [Angular Signals](https://angular.dev/guide/signals).
- Der HTTP-Service kapselt API-Aufrufe; verspätete Antworten werden nur übernommen, wenn Fall-, Profil- und Szenarioversion noch passen.
- Formulare, Advisor und Portal verwenden denselben bestätigten Zustand. Kein zweites Personenmodell allein für den Chat.
- Fachregeln und Produkteignung bleiben auf dem Server; der Client zeigt ihre strukturierten Resultate an.
- Route Guards verbessern die Navigation. Die serverseitige Fallberechtigung bleibt verpflichtend; Angular warnt ausdrücklich davor, Guards als alleinigen Zugriffsschutz zu verwenden. [Offizielle Referenz](https://angular.dev/guide/routing/route-guards).

Die Workshop-Navigation wird über einen gemeinsamen Workspace-State abgebildet: `activeTab`, `GraphContext`, `timeBudget`, `AgentPresentation` und `SummarySnapshotRef`. Der Formularentwurf und bestätigte Falldaten bleiben davon getrennt. Ein Tabwechsel löst keinen Profil-Neustart und keine Audioaufnahme aus.

### 6.4 Designregeln für diesen Prototyp

Bevorzugt die Paket-Tokens verwenden. Bei nötigem Fallback gelten die archivierten Markenfarben Pax Green `#8CCD0F`, Pax Purple `#3C0078`, Weiß `#FFFFFF` und dunkler Text `#121212`; siehe [Markenfarben](../references/web/design/brand/pax-brand-farben.txt). Kleine Texte auf Grün werden auf Kontrast geprüft. Rot, Grün und Gelb werden immer durch Text und Symbole ergänzt.

Benötigte Komponenten: Buttons, beschriftete Inputs, Auswahlfelder, Schrittanzeige, zusammenklappbare Herkunftsdetails, Status-Chips, Fehlermeldung, Dialog und Karten. Individuelle Visualisierung: eine schlichte SVG-/HTML-Zeitachse mit zugänglicher Tabelle. Eine aufwendige Diagrammbibliothek ist für P0 nicht erforderlich.

Monat/Jahr, CHF und Brutto/Netto werden am Feld angezeigt. Formatierte Geldwerte werden vor API-Versand in kanonische Werte umgewandelt. Eingabemasken dürfen Dezimalstellen oder Apostrophe nicht still falsch interpretieren. Wenn eine Pax-Komponente Reactive Forms nicht direkt unterstützt, wird ein getesteter App-Adapter verwendet.

Pax-Analytics wird nicht allein wegen eines Beispiels in der Installationsanleitung aktiviert. Schrift- und Assetnutzung werden mit der Paket-/Markenfreigabe abgeglichen. Das lokal archivierte vlot-JavaScript wird weder importiert noch nachgebaut.

## 7. Backend-Architektur und Workshop-Workflow

Ein Angular-Client und ein NestJS-Backend reichen für P0. Es gibt keine Microservices, keine zusätzliche Workflow-Engine und keinen separaten Vektor-Datenbankdienst. Die folgenden Module bleiben im selben Backend getrennt testbar:

| Modul | Verantwortung | Darf nicht übernehmen |
|---|---|---|
| `AuthModule` | Sitzung, Nutzerrolle, Ablauf und Fallzugriff | Datenfreigabe allein aus einer vom Client gesendeten Case-ID ableiten |
| `CaseModule` | Profil, Quellen, Ziele und Versionierung | Versteckte Berechnungen beim Lesen eines Profils |
| `CalculationModule` | Vorbedingungen, Adapteraufruf und normalisierte Ergebnisse | Fremde HTTP-200-Antwort automatisch als fachlich gültig markieren |
| `ScenarioModule` | Ereignisse, Patches, Kapitalzuordnung und Vergleich | Unbekannte künftige Leistungen als garantiert skalieren |
| `SpeechBoundary` | Nur bei freigegebenem serverseitigem Speech: temporäre STT-/TTS-Weiterleitung | Ungeklärten Browser-/Cloudanbieter als lokal ausgeben oder Audio dauerhaft debuggen |
| `SummaryModule` | Kunden-/Fachpersonensicht desselben bestätigten Snapshots | Separate Zahlen neu erfinden oder beim Export automatisch senden |
| `AdvisorModule` | Kontextminimierung, Feldvorschläge, Rückfragen, Erklärungen | Berechtigungen oder Geldwerte erfinden |
| `RecommendationModule` | Bedarf, Handlungsoptionen, Produktregeln und Prüfgründe | Lücken durch Verkaufslogik verändern |
| `JourneyModule` | Demo-Offerte, Antrag, Prüfung und Police | Reale Annahme ohne freigegebenen Pax-Prozess behaupten |
| `DossierModule` | Gemeinsames Ergebnis-/Entscheidungsdossier | Abweichende Zahlen aus Textbausteinen zusammensetzen |
| `AuditModule` | Metadaten und nachvollziehbare Statusereignisse | Rohgespräche, Schlüssel oder Gesundheitstexte in allgemeine Logs schreiben |

```mermaid
flowchart LR
  U[Nutzer] <--> D[Voice - Dario]
  D -->|VoiceLog| E[KI-Advisor - Earnie]
  E --> S[Strukturierter Fallstand]
  S -->|AnalysisRequest| V[Logik - Valentin]
  V -->|AnalysisResult| L[Angular Dynamic View - Luca]
  V --> S
  S --> E
  E -->|AgentReply| D
  D -->|Playback-Ereignis| A[Agent - Lukas]
  S -->|Fortschritt| A
  L -->|GraphContext und Nachfrage| E
```

Das zweite Foto ergänzt die Kommunikationsrichtung: Nutzer/Voice → Dario → Earnie („Voice Log“), strukturierter Übergabestand ↔ Valentin → Luca („Result“), passende Antwort zurück an Dario und tatsächliche Voice-Ereignisse an Lukas. Die [konkreten Schnittstellen](interface-contracts.md) I01–I10 beschreiben Produzent/Empfänger, Pflichtfelder, Versionen und Fehler. Der Nutzer hat den Dokumentknoten als gemeinsame JSON präzisiert. Diese ist ein versionierter kanonischer Fallstand; Datenbank und Transport bleiben Umsetzungsvorschläge.

Die beiden Backend-Bezeichnungen auf dem Board sind bestätigte Verantwortungsbereiche: Valentin für Fach-/Rechenlogik, Earnie für KI-/Dialog-Backend. Eine gemeinsame NestJS-Grundlage bleibt ein Vorschlag, keine behauptete Workshop-Entscheidung für zwei Prozesse oder einen bestimmten Backend-Stack. Sie vermeidet doppelte Sitzungs-/Fallmodelle.

Der Modellanbieter und Logismata erhalten ausschließlich den für ihren Zweck erlaubten Teil des Falls. Eine externe Modell-URL wird nicht vom Browser oder von Dokumenttext übernommen. Das Backend hat eine feste Anbieter-/Operationen-Allowlist.

## 8. Gemeinsamer Datenvertrag

### 8.1 Werte mit Herkunft statt unqualifizierter Zahlen

Konzeptionelles Beispiel; kein bereits existierendes Repository-Schema:

```ts
type FieldValue<T> = {
  value: T | null;
  origin: 'user' | 'document' | 'api' | 'estimate' | 'synthetic';
  confirmation: 'proposed' | 'confirmed';
  review: 'unreviewed' | 'reviewed' | 'rejected';
  sourceRef?: string;
  observedAt?: string;
  effectiveFrom?: string;
};

type MoneyValue = FieldValue<number> & {
  currency: 'CHF';
  unit: 'cent';
  period: 'month' | 'year' | 'once';
  basis: 'gross' | 'net_before_income_tax' | 'net_after_income_tax' | 'capital';
};
```

Geld wird intern in ganzen Rappen geführt, mit überprüften numerischen Grenzen. Prozentwerte besitzen eine vereinbarte Skalierung. Der Adapter rechnet am Rand in die vom Anbieter erwarteten CHF-Beträge um. Ein als Anteil gespeicherter Zins von `0.02` darf nicht ungeprüft an ein Prozentfeld gesendet werden, das `2` erwartet.

`null` bedeutet unbekannt. Die Zahl `0` bedeutet eine tatsächlich erfasste oder berechnete Null. Ein vom Modell vermuteter Wert bleibt `proposed`; er wird nicht automatisch gespeichert oder als Benutzerbestätigung behandelt.

### 8.2 Entitäten und Pflichtbeziehungen

| Entität | Wesentliche Felder | Wichtige Invariante |
|---|---|---|
| `Case` | ID, Besitzer, Modus, Sprache, aktuelle Profilversion | Gehört genau einer berechtigten Demo-Sitzung bzw. einem freigegebenen Nutzer |
| `ProfileVersion` | ID, Case-ID, Version, bestätigte Daten, Erstellungszeit | Nach Bestätigung unveränderlich; Änderungen erzeugen neue Version |
| `Person` | ID, Rolle, erforderliche Rechendaten, Erwerb | Stabile ID; keine Zuordnung allein anhand des Namens |
| `HouseholdRelationship` | Personen, Beziehung, Beginn | Beziehung und Beginn getrennt; kein erfundenes Heiratsjahr |
| `Child` | Geburt/Alter, Unterstützung, Elternzuordnung | Unterstützungsdauer nicht pauschal mit Volljährigkeit gleichsetzen |
| `Goal` | Typ, Zeitpunkt, Zielbetrag/-zustand, Priorität | Ziele dürfen konkurrieren und unfinanziert sein |
| `Income` | Person, Betrag, Basis, Periode, Zeitraum | Keine Mischung monatlicher Netto- und jährlicher Bruttowerte |
| `Expense` | Kategorie, Betrag, Zeitraum, beinhaltet Steuern/Sparen? | Derselbe Aufwand wird nicht zweimal abgezogen |
| `Asset` | Eigentümer, Kategorie, Betrag, Verfügbarkeit, Zweck | Gebundene Mittel sind nicht automatisch liquide |
| `Debt` | Restbetrag, Zinsannahme, Tilgung, Zeitraum | Tilgung und Zins werden unterschiedlich behandelt |
| `Provision` | Säule, versicherte Person, Leistung, Ursache, Zeitraum | Kapital, Rente und Beitrag sind unterschiedliche Größen |
| `ScenarioVersion` | Baseline-ID, Ereignisse, Annahmen, Input-Hash | Überschreibt keine Baseline |
| `CalculationRun` | Profil-/Szenario-ID, Provider, Operationen, Validierungsstatus | Ergebnis ist ohne passende Eingabeversion nicht aktuell |
| `Recommendation` | Run-IDs, Regelversion, Bedarf, Alternativen, Prüfgründe | Verweist auf eine konkrete Bedarfsberechnung |
| `Quote` / `Application` / `Policy` | Vorgänger-IDs, Status, Dokumentversion, Demo-Kennzeichen | Keine Police ohne passenden Annahmeschritt |
| `ReviewTask` | Grund, Zuständigkeit, offener/geschlossener Status, Ergebnis | Nur berechtigte Review-Rolle kann erforderliche Prüfung abschließen |
| `AuditEvent` | Akteur, Aktion, Objekt, Version, Zeit, Ergebnis | Liefert Entscheidungsfakten statt interner Modellgedanken |

### 8.3 Reifegrade getrennt speichern

`profileCompleteness`, `calculationValidation`, `recommendationReadiness` und `journeyStatus` sind eigene Felder. Ein vollständiges Formular kann zu einer unvalidierten Berechnung führen. Ein vorhandenes PDF bedeutet nicht, dass der Fall fachlich geprüft oder ein Vertrag zustande gekommen ist.

Der Dossierexport übernimmt diese Eigenschaften unverändert. Die aus dem öffentlichen Referenztest bekannte Kombination „Abschluss gelungen, Export dennoch Entwurf“ muss im eigenen Produkt mit einem konkreten, verständlichen Grund versehen werden.

## 9. Finanzielle Logik: ein Haushalt, mehrere Sichten

### 9.1 Explizite Rechnungsebenen

1. Aktuelles Haushaltsbudget: tatsächliche bzw. bestätigte Einnahmen und Ausgaben.
2. Persönliche Tragbarkeit: Verpflichtungen und Mittel der Person, die einen Vertrag eingehen würde.
3. Ereignisversorgung: Leistungen bei Krankheit, Unfall, Tod und Pensionierung für definierte Phasen.
4. Kapitalplanung: verfügbares, reserviertes und gebundenes Vermögen sowie Entnahmen über die Zeit.
5. Zielvergleich: Was verbessert oder verschlechtert sich gegenüber derselben Baseline?

Diese Ebenen dürfen nicht durch das Addieren beliebiger API-Felder ersetzt werden. Insbesondere kann ein `IncomeTotal` bereits Partnereinkommen enthalten. Es wird nicht noch einmal hinzuaddiert, bevor die Feldsemantik geprüft ist.

### 9.2 Budgetgleichung und Einheiten

Konzeptionell gilt pro Zeitraum:

```text
verfuegbarer Cashflow
  = Einkommen nach Sozialabzuegen
  - Einkommensteuern, soweit noch nicht enthalten
  - Lebenshaltungskosten
  - bestehende Versicherungs-/Vorsorgeverpflichtungen
  - Schuldendienst
  - gewaehlte Ruecklagenbildung

zusaetzlich tragbarer Beitrag
  = max(0, verfuegbarer Cashflow - bestaetigter Sicherheitspuffer)
```

Die Formeln gelten nur, wenn die Einzelpositionen bekannt und überschneidungsfrei sind. Ein negatives Budget bleibt zusätzlich als Fehlbetrag sichtbar; es wird nicht nur durch die `max`-Operation versteckt. Die Höhe des Sicherheitspuffers ist eine bestätigte Planungsannahme, keine allgemeingültige Regel.

Das archivierte Budget-Schema beschreibt `IncomeNet` als Einkommen nach Sozialabzügen. Es darf nicht automatisch als Einkommen nach Einkommensteuern verstanden werden. Ein vorhandenes echtes Netto-nach-Steuern-Feld wird anders behandelt. Valentin dokumentiert für jede verwendete Operation, ob Steuern, private Vorsorgebeiträge und Partnerwerte bereits enthalten sind.

Ein statistischer Budgetvorschlag wird als Vorschlag übernommen und einzeln bestätigt oder ersetzt. Er ist keine Messung der tatsächlichen Lebenshaltungskosten. Bereits enthaltene private Vorsorgebeiträge werden bei einem neuen Sparvorschlag nicht nochmals vollständig als zusätzliche Belastung angesetzt.

### 9.3 Lücken und Überschüsse

Für einen fachlich konsistenten Zeitraum mit demselben Bedarf und Leistungsbegriff:

```text
Luecke      = max(0, Bedarf - verfuegbare Leistungen)
Ueberschuss = max(0, verfuegbare Leistungen - Bedarf)
```

Ein fehlender Bedarf führt zu `needs_input`, nicht zu einer rechnerisch grünen Null-Lücke. Eine bedarfsabhängige Produktempfehlung ist dann gesperrt. Monatswerte dürfen gerundet dargestellt werden; Regeln und Vergleiche benutzen den vereinbarten ungerundeten bzw. Rappenwert. Die Rundungsmethode wird zentral festgelegt.

Kapital darf nur über ein ausgewiesenes Entnahmemodell zu Einkommen werden. Ein Kontostand von CHF 20’000 ist keine Rente von CHF 20’000 pro Jahr. Verzehr, Renditeannahme, Dauer und Erschöpfungszeitpunkt werden zusammen angezeigt.

### 9.4 Drei Säulen und zusätzliche Leistungsträger

| Ebene | P0-Darstellung | Kritische Grenze |
|---|---|---|
| Erste Säule | Übernommene AHV-/IV-Leistungen mit Eingabe- und Modellstand | Beitragsjahre, Beziehung und Bezugsbeginn nicht frei durch den Advisor schätzen |
| Zweite Säule | Dokumentierte PK-Werte oder ausdrücklich bezeichnete Schätzung | Zukünftige Leistungen bei neuem Pensum nicht automatisch proportional setzen |
| Dritte Säule | Bestehende 3a-/3b-Mittel, Beiträge, Bindung und ausgewählter Kapitalverzehr | Guthaben, Einzahlung, Steuerersparnis und Risikoleistung nicht verwechseln |
| Arbeitgeber/Taggeld/Unfall | Eigene Leistungsphasen, soweit belegt | Nicht zusätzlich zu bereits koordinierten Provider-Gesamtleistungen addieren |
| Private Risikoabsicherung | Bestehende Renten/Kapitalien nach Ereignis | Nicht alle Policen leisten bei jeder Ursache und Wartefrist |

Der PoC zeigt erste, zweite und dritte Säule auch dann, wenn eine von ihnen noch Datenlücken hat. Unvollständigkeit eines Säulenbereichs ist ein Handlungsgrund und wird nicht durch Weglassen des Bereichs kaschiert.

### 9.5 Kapitalzuordnung ohne Doppelzählung

Für jedes Asset gibt es `availableFrom`, `liquidityClass`, `earmark` und `allocations`. Die Summe verbindlicher Zuordnungen darf das verfügbare Kapital nicht übersteigen. Ein 3a-Guthaben kann im Eigenheimszenario höchstens als bedingt nutzbare Finanzierungsidee erscheinen, solange Freigabe, Zweck, Steuerfolgen und Auswirkungen auf die Versorgung nicht geklärt sind.

Eine reservierte Eigenheim-Einlage bleibt im Vermögensbild sichtbar, verschwindet aber aus dem frei verfügbaren Kapital. Ihre spätere Nutzung für die Pensionierung wird nicht gleichzeitig weitergerechnet. Ein Immobilienwert ersetzt keinen jederzeit nutzbaren Notgroschen.

### 9.6 Nachvollziehbares eigenes Spar-/Entnahmemodell

Für rein illustrative Szenarien wird eine einzige Zahlungszeitpunkt-Konvention festgelegt, z. B. Beiträge und Entnahmen am Monatsende:

```text
r_monat = (1 + r_jahr_effektiv)^(1/12) - 1
Kapital_vor_Entnahme = Kapital_alt * (1 + r_monat) + Beitrag
tatsaechliche_Entnahme = min(geplante_Entnahme, max(0, Kapital_vor_Entnahme))
Kapital_neu = max(0, Kapital_vor_Entnahme - tatsaechliche_Entnahme)
ungedeckter_Entnahmebedarf = geplante_Entnahme - tatsaechliche_Entnahme
```

Bei Nullzins und gleichbleibenden Beiträgen ist der benötigte monatliche Sparbetrag für ein reines Kapitalziel `max(0, Zielkapital - Startkapital) / AnzahlMonate`. Bei positiver Verzinsung kann dieselbe Periodenrechnung iteriert werden; P0 benötigt keinen eigenen komplexen Optimierer. Kosten, Steuern und Versicherungsleistungen werden nur einbezogen, soweit separat bekannt oder als vereinfachte Annahme bestätigt. Das Ergebnis ist keine versicherte Rente und keine Renditezusage.

Jeder Lauf trägt zusätzlich eine Preisbasis und ein Bewertungsdatum. Nominale Zukunftswerte werden nicht mit heutigen Budgets vermischt. Wenn ein Provider die Preisbasis für einen Vergleich nicht ausreichend erklärt, bleibt die Vergleichbarkeit eingeschränkt. Ein optionaler realer Renditeansatz wäre `(1 + Nominalrendite) / (1 + Inflation) - 1`; er wird erst verwendet, wenn beide Annahmen und die übrigen Zahlungsströme dazu konsistent sind. Eine standardmäßig angenommene Rendite wird nie als Prognose des Kundenfonds bezeichnet.

## 10. Szenario-Engine und Zeitachse

### 10.1 Gemeinsames Ereignismodell

Ein Ereignis hat Typ, wirksames Datum, betroffene Personen/Assets und strukturierte Änderungen. Beispiele: `employment_changed`, `child_expected`, `child_support_assumption_changed`, `home_purchase_planned`, `work_stopped`, `pension_started`, `capital_withdrawn`.

Jedes Szenario entsteht als Kopie einer unveränderlichen Baseline plus Ereignissen. Der Vergleich enthält Baseline-Hash, Szenario-Hash, Annahmenversion, Rechenläufe und die Liste tatsächlich veränderter Positionen. Ein „Mehr sparen“-Szenario darf nicht heimlich noch Rentenalter oder Rendite ändern.

P0 berechnet ausgewählte Ereigniszeitpunkte und dazwischen konstante Phasen. Das ist keine vollständige monatliche Schweizer Leistungsmaschine. Benötigte Ereignisse: wirksamer Pensumswechsel, Hauskauf, Beginn/Ende bestätigter Leistungsphasen, Erwerbsende und Rentenbeginn beider Personen sowie Kapitalerschöpfung im jeweiligen vereinfachten Modell.

### 10.2 Algorithmus für einen Vergleich

1. Baseline laden und Berechtigung prüfen.
2. Szenario-Patch gegen erlaubte Felder und Einheiten validieren.
3. Abhängigkeiten bestimmen: welche Personen, Budgetpositionen, Leistungen und Ziele ändern sich?
4. Ereignisse ordnen; widersprüchliche Zuordnungen oder doppelte Kapitalverwendung ablehnen.
5. Pro relevanter Phase zulässige Provider-Eingaben aus den effektiven Daten erzeugen.
6. Bestätigte Leistungen, Provider-Schätzungen und ergänzende Demo-Modelle getrennt kennzeichnen.
7. Ergebnisse normalisieren, Plausibilität prüfen und offene Fachfragen erhalten.
8. Differenzen nur bei vergleichbaren Kennzahlen und Perioden bilden.
9. Vergleich speichern und erst dann an UI, Advisor und Empfehlung geben.

Schnelles Ziehen eines Reglers löst nicht pro Pixel einen Provider-Aufruf aus. Die Oberfläche zeigt einen Entwurf; „Variante berechnen“ startet den verbindlich gespeicherten Lauf. Spätere Optimierung: begrenztes Debouncing und Abbruch veralteter Anfragen.

### 10.3 Szenario A: Familie und Pensum

**Eingaben:** Zeitpunkt, aktuelles und geplantes Pensum je Person, Verhältnis von Vollzeit- zu tatsächlichem Einkommen, bestätigte Netto-/Bruttobasis, Betreuungskosten und weitere veränderte Kosten. Zusätzlich: PK-/Arbeitgeberdaten oder ausdrücklich gewählte Schätzannahmen.

**Minimaler funktionierender Pfad:** Eine Person reduziert oder erhöht das Pensum. Das zugehörige Einkommen und die bestätigten Kostenpositionen ändern sich. Das Backend aktualisiert Budget und berechenbare Risiko-/Pensionswerte. Die UI zeigt verfügbaren Betrag, Reserveentwicklung und die Änderung der bekannten Versorgung; nicht zuverlässig berechenbare PK-Folgen bleiben offen.

Wenn nur tatsächliches Einkommen und tatsächliches Pensum bekannt sind, darf ein rein linearer Lohnvergleich ausschließlich als bestätigte Planungsannahme verwendet werden. Nicht aus „Pensum 60 %“ schließen, dass die PK-Rente genau 60 % der bisherigen Rente beträgt. Koordinationsregeln und konkrete Pläne können andere Effekte haben.

Das Logismata-Risiko-Schema enthält Kinderzahlen, aber keine vollständige kindbezogene monatliche Leistungsbiografie. Unterschiedliche zukünftige Unterstützungsphasen werden deshalb nicht als nativ verifizierte API-Funktion ausgegeben. Unbekannte Leistungsenddaten werden nicht pauschal auf den 18. Geburtstag gesetzt.

**Abnahme:** Baseline bleibt unverändert; mindestens eine tatsächliche Budgetdifferenz entsteht; Herkunft und offene PK-Folgen sind sichtbar; beide Personen bleiben getrennt; ein bestehendes 3a-Sparziel passt sich nicht still automatisch an ein kleineres Einkommen an.

### 10.4 Szenario B: Eigenheim

**Eingaben:** Zeitpunkt, Kaufpreis, Kauf-/Nebenkostenannahme, frei verfügbare Eigenmittel, geplante Reserve, gewünschte Finanzierung, Zins-/Unterhalts-/Tilgungsannahmen und gegebenenfalls bedingt einsetzbare Vorsorgemittel.

**Minimaler funktionierender Pfad:** Das Modell berechnet eine offen gelegte Beispiel-Eigenmittellücke und die laufende Budgetdifferenz gegenüber der bisherigen Miete. Es reserviert die tatsächlich vorgesehenen freien Mittel und zeigt deren spätere Nichtverfügbarkeit für andere Ziele. Bereits gebundene Mittel bleiben getrennt.

```text
benoetigte freie Mittel
  = angenommener Eigenmittelbedarf
  + angenommene Kaufnebenkosten
  + gewuenschte verbleibende Reserve

Kapitalfehlbetrag
  = max(0, benoetigte freie Mittel - dafuer verfuegbare freie Mittel)
```

Alle Quoten und Stresszinsen sind konfigurierbare Demo-Annahmen, bis Pax bzw. eine zuständige Stelle konkrete Kriterien bestätigt. Der PoC trifft keine Hypotheken- oder Kreditwürdigkeitsentscheidung. Ein Vorbezug wird nicht allein aufgrund eines sichtbaren 3a-/PK-Guthabens als zulässig behandelt.

Mit CHF 25’000 zusätzlich erfundenen freien Ersparnissen und einer gewünschten Reserve von CHF 15’000 bleiben rechnerisch CHF 10’000 vor weiteren Kaufkosten verfügbar. Diese reine Zuordnungsrechnung ist nachvollziehbar; daraus folgt weder eine Finanzierungsmöglichkeit noch ein gültiger Vorsorgevorbezug.

**Abnahme:** Fehlende Mittel erscheinen als Fehlbetrag; Reserve wird erhalten oder die bewusste Unterschreitung erklärt; Kapital ist nicht doppelt zugeordnet; Auswirkungen auf andere Ziele werden gezeigt; kein einzelnes Ampelsignal wird als Bankzusage formuliert.

### 10.5 Szenario C: Pensionierung

**Eingaben:** Erwerbsende je Person, gegebenenfalls davon abweichender Rentenbeginn, bestätigtes Zielbudget, PK-Renten-/Kapitalwerte und Kapitalwahl, 3a/3b, Sparbeiträge, Rendite-/Inflationsannahmen sowie Betrachtungshorizont.

Die API kennt `DesiredRetirementAge`. Daraus darf nicht abgeleitet werden, dass alle Bezugsregeln, jede Teilpensionierung und jede künftige PK-Anpassung abgebildet sind. Erwerbsausstieg mit 62 bedeutet nicht automatisch AHV-Bezug mit 62. Der PoC benennt einen nötigen Überbrückungszeitraum ausdrücklich.

**Minimaler funktionierender Pfad:** Zwei Erwerbs-/Pensionierungszeitpunkte und mindestens eine Übergangsphase werden getrennt dargestellt. Der Adapter nutzt zulässige Alterswerte und übergebene Leistungen. Der Kapitalteil verwendet ein ausgewiesenes Entnahmemodell. Ein früheres Erwerbsende aktualisiert mindestens Einkommen, Überbrückungsdauer und Kapitalbedarf; falls Rentenfolgen nicht freigegeben berechenbar sind, werden sie als offene oder geschätzte Folgen gezeigt.

**Abnahme:** Kein fortgeschriebenes Erwerbseinkommen nach dem gesetzten Erwerbsende; kein Rentenbeginn ohne passende Grundlage; Kapitalverzehr ist endlich und kann erschöpfen; gleiche Assets werden nicht zugleich im Eigenheim- und Rentenplan vollständig verzehrt; getrennte Phasen verwenden konsistente Preise/Perioden.

### 10.6 Wann der Vergleich nicht berechnet werden darf

Unbestätigtes Basiseinkommen, fehlender Bedarf, unklare Einheit, nicht abbildbarer API-Pflichtparameter oder doppelte Kapitalzuordnung sperren den betreffenden Pfad. Ein nicht betroffener Teilvergleich darf weiter angezeigt werden, z. B. die reine Cashflow-Folge einer bestätigten Kostenänderung. Die Oberfläche erklärt den Umfang dieser Teilauswertung.

## 11. Logismata-Integration mit tatsächlichen Operationen

### 11.1 Vertragsgrundlage

Verifiziert sind eine archivierte OpenAPI und 24 Beispiele. Ausgangspunkt: [APICalc.yaml](../references/api/openapi/APICalc.yaml), [Schemaindex](../references/api/openapi/schema-index.json), [Beispiele](../references/api/examples/) und [Quellenkatalog](../references/README.md).

Der geplante Adapter verwendet den freigegebenen Basis-Host und `POST /operation/standard/<operationId>`. Token und Hostkonfiguration bleiben auf dem Server. Der lokale Recherchezugang nutzt `LOGISMATA_BEARER_TOKEN`; die vorhandene Root-Vorlage verwendet `LOGISMATA_TOKEN`. Beim Start erfolgt eine ausdrückliche Zuordnung zu genau einem internen Konfigurationsnamen; beide Werte werden nicht parallel ungeprüft genutzt. Der Recherche-Token war mit Ablauf am 03.11.2026, 23:59:59 Europe/Zurich dokumentiert; vor Verwendung sind Gültigkeit und Berechtigung zu prüfen.

### 11.2 Priorisierte Operationsliste

| Priorität | Operation | Zweck im PoC | Wesentliche Begrenzung |
|---|---|---|---|
| P0 | `APICalc_getSaving3aLimits` | Aktuellen gelieferten 3a-Rahmen laden | Ohne P2 ist der Höchstbetrag keine vollständige individuelle Beitragsprüfung |
| P0 | `APICalc_getAgeLimits` | Zulässige Altersparameter und Grenzen | Personenbezogene Inputs notwendig; nicht pauschal ein Alter für alle |
| P0 | `APICalc_getTaxBaseInfo` | Steuerdatenstand anzeigen | Kein Beleg, dass alle künftigen Steuerjahre modelliert sind |
| P0 | `APICalc_searchLocation` | Steuerort anhand bestätigter Auswahl | PLZ ist nicht selbst die `TaxLocationID` |
| P0 | `APICalc_getLocation` | Gewählten Steuerort nachvollziehen | Kein automatischer Zugriff auf präzise Geräteposition |
| P0 | `APICalc_calculateIncome` | Unterstützte Einkommensumrechnung | Dokumentierte Mindestbetrag-/Fachgrenzen beachten |
| P0 | `APICalc_calculateBudgetProposal` | Vorschlag bei unbekannten Kategorien | Benutzerbestätigung und Doppelzählungsprüfung erforderlich |
| P0 | `APICalc_calculateRiskBase` | Basis-/Schätzwerte der Risikoanalyse | Nicht mit bestätigtem PK-Ausweis gleichsetzen |
| P0 | `APICalc_calculateRisk` | Getrennte Risikoereignisse je Person | Ungeklärter fachlicher Ergebniscode 0 gegenüber Schema 1 |
| P0 | `APICalc_calculateRetirementBase` | Basiswerte für Pensionierung | Approximierte Werte als solche erhalten |
| P0 | `APICalc_calculateRetirement` | Renten-/Kapitalbedarf und Lücke | Liefert keine vollständige beliebige Ereignissimulation |
| P0 | `APICalc_calculateSaving` | Sparziel oder notwendiger Beitrag | Zins, Dauer und Beitragsperiode explizit |
| P0 | `APICalc_calculateConsumption` | Kapitalverzehr und Dauer | Keine lebenslange Rentengarantie aus einem Entnahmemodell |
| P1 | `APICalc_calculateSaving3a` | Steuer-/Sparvergleich bei vollständigen Pflichtdaten | Persönliche Angaben und Steuerannahmen erforderlich |
| P1 | `APICalc_calculateIncomeFortuneTax` | Vertiefte Steuerbetrachtung | Fehlende Konfession oder Steuerbasis nicht heimlich erfinden |
| P1 | `APICalc_calculateCapitalTax` | Kapitalbezugsvergleich | Nicht jede zeitliche Staffelung automatisch abgebildet |
| P1 | `APICalc_calculatePurchaseP2` | PK-Einkauf als gesonderte Option | Individuelle Einkaufsmöglichkeit muss bekannt sein |
| P2 | `APICalc_getAdditionalEstateGainFields` | Zusatzdaten für Grundstückgewinnsteuer | Für P0-Hauskauf nicht nötig |
| P2 | `APICalc_calculateEstateGainTax` | Spätere Verkaufs-/Steuerplanung | Kein vollständiger Hypothekenrechner |
| P2 | `APICalc_calculateAllInheritanceDonationTaxes` | Ergänzende Übersicht | Kein Pflichtteil der Hauptdemo |
| P2 | `APICalc_calculateGroupInheritanceDonationTaxes` | Ergänzende Gruppenbetrachtung | Kein Pflichtteil der Hauptdemo |
| P2 | `APICalc_calculateBeneficiaryInheritanceDonationTax` | Vertiefter Erbschaftsfall | Fachlich gesondert zu prüfen |
| P2 | `APICalc_searchLocationGeo` | Geografische Komfortsuche | Nicht nötig; keine Standortberechtigung für P0 verlangen |
| P2 | `APICalc_calculateCorporateEntityTax` | Unternehmensfall | Außerhalb der privaten Hauptzielgruppe |

P0 bedeutet: im Adapter priorisiert. Nicht jeder Endpunkt muss in jeder Nutzerinteraktion aufgerufen werden. Eine zentrale Operation wird nur für den konkreten Bedarf ausgelöst.

### 11.3 Vor jedem Aufruf

Das Backend prüft Besitzer, Profilversion, benötigte Daten, Wertebereich, Einheit, Herkunft und die konkrete Operation. Gemeinsame Schemas werden auch zur Laufzeit validiert. NestJS beschreibt dafür serverseitige Validation Pipes; ein gemeinsames Zod-Schema kann über einen eigenen Schema-Pipe angebunden werden. [Technische Referenz](https://docs.nestjs.com/techniques/validation).

Die mindestens erforderlichen Geschäftseingaben gehen über formale OpenAPI-Pflichtfelder hinaus. Bei Risiko werden `NeedDisability` und `NeedDeath` bzw. begründete Nichtanwendbarkeit gesetzt. Ein nicht erfasster Bedarf wird nicht allein deshalb weggelassen, weil das Schema ihn optional nennt.

`IncomeType`, `Relationship`, `Sex`, Sprach- und Szenariocodes erhalten explizite Mapper. Datenmodell und API-Enums sind nicht dieselben Typen. Ein fachlich nicht abbildbarer Geschlechts-/Rentenparameter wird erklärt und gegebenenfalls menschlich geklärt; er wird nicht aus Name, Anrede oder Pronomen geraten. Eine für Steuerberechnungen notwendige, nicht bekannte Konfession führt zur Einschränkung dieses Rechenpfads; „keine“ wird nicht als unsichtbarer Standard gesetzt.

### 11.4 Antwortnormalisierung und Status

Der Adapter prüft Transportstatus, JSON-Hülle `response`, Schema, Endpunkt-spezifische Codes, Szenariocode, finiten Zahlenbereich und Plausibilität. Ein `errorcode` einer Fehlerhülle ist nicht automatisch dasselbe wie `ErrorCode` im fachlichen Ergebnis.

Für Risiko gilt laut archiviertem Schema: 1/2 = Invalidität Krankheit/Unfall Luca; 3/4 = Tod Krankheit/Unfall Luca; 5–8 entsprechend Valentin. Die Beispiele enthalten Code 0, während das Schema Code 1 als OK nennt. **Bis zur fachlichen Klärung werden solche Ergebnisse als `requires_review` behandelt.** Sie werden nicht still verworfen, aber auch nicht als vollständig validierte Produktempfehlung freigegeben. Pensionierungsbeispiele mit Code 1 dürfen nicht pauschal dieselbe Ausnahmebehandlung erhalten.

Ausgabeformen: `valid`, `estimated`, `requires_review`, `needs_input`, `provider_error`, `unsupported`, `stale`. Der Reifegrad wird pro Ergebnisbereich gespeichert, nicht nur als ein globales Erfolgs-Boolean.

### 11.5 Stabilität und Ausfall

Vorgeschlagene technische Startwerte, später messbar anzupassen: fünf Sekunden Timeout pro Rechenaufruf, höchstens ein Retry bei klaren temporären Transportfehlern, höchstens zwei gleichzeitige Calls pro Sitzung. 401/403 werden nicht wiederholt; 429 berücksichtigt die Provider-Vorgabe. Bei Timeouts wird keine wiederholte Aufrufschleife gestartet.

Öffentliche Grenz-/Metadaten können für den dokumentierten Provider-/Datenstand zwischengespeichert werden. Personenbezogene Rechenantworten werden fallbezogen gespeichert, nicht global über ungeschützte Cache-Keys verteilt. Ein Replay ist nur bei passendem vollständigem Input-/Modell-Hash erlaubt. Geänderte Eingaben plus alte Zahlen gelten nicht als Offline-Berechnung.

## 12. AI Advisor: konkrete Aufgaben und Grenzen

### 12.1 Die AI erledigt vier Aufgaben

1. Freitext in vorgeschlagene strukturierte Angaben überführen.
2. Die nächste relevante Frage formulieren.
3. Vorliegende Rechenergebnisse samt Annahmen erklären.
4. Die regelbasiert ermittelten Handlungsoptionen verständlich gegenüberstellen.

Sie entscheidet weder allein über einen Versicherungsabschluss noch über Annahme, Prämie, medizinische Einstufung, Kreditfähigkeit oder verbindliche Angemessenheit. Sie verändert keine Datenbankfelder direkt.

### 12.2 Geplanter Ausgabevertrag

```json
{
  "kind": "profile_patch_proposal",
  "proposedChanges": [
    {"path": "goals.home.targetYear", "value": 2031, "source": "user_message"}
  ],
  "clarification": "Soll der Hauskauf 2031 stattfinden?",
  "requiresConfirmation": true,
  "references": [],
  "blockedReasons": []
}
```

Jede Antwort wird gegen ein Schema geprüft. Erlaubte Pfade sind serverseitig festgelegt; sensible bzw. fachlich unzulässige Änderungen werden abgewiesen. Freie Zahlen in einer Ergebnis-Erklärung müssen auf strukturierte Ergebnisreferenzen zurückführbar sein. Das Backend kann nach Schemafehler einmal eine Korrektur anfordern; danach folgt ein offen bezeichneter Fallback.

### 12.3 Reihenfolge intelligenter Rückfragen

Zuerst Informationen, die eine falsche Entscheidung verhindern: fehlender Bedarf, Brutto-/Nettobasis, persönliche Verpflichtungen, bestehende Deckungen, PK-Werte, gebundenes Kapital und zeitliche Ziele. Danach Details, die den Vergleich verbessern. Danach Komfortangaben.

Ein gemeinsamer Fragenkatalog enthält pro Frage `id`, Voraussetzung, betroffenes Ergebnis, Antworttyp, Grund und Erledigungsbedingung. Der Server wählt die zulässige nächste Fragengruppe. Die AI formuliert sie passend zur Sprache und Situation. Dadurch kann sie nicht allein durch Gesprächsstil wichtige Pflichtfragen überspringen.

Beispiel: Wenn die Person zwar sparen möchte, aber das freie Budget unbekannt ist, fragt das System nach tragbarem Monatsbetrag und relevanten Ausgaben. Eine Produktfrage wird nicht dadurch vorgezogen, dass der Benutzer ein Produkt erwähnt hat. Ein ausdrücklicher Informationswunsch zu einem Produkt darf trotzdem sachlich beantwortet werden, ohne daraus eine persönliche Empfehlung zu machen.

### 12.4 Erlaubte interne Werkzeuge

| Werkzeug | Wirkung | Schutz |
|---|---|---|
| `get_case_summary` | Liefert minimierten aktuellen Kontext | Case-ID und Besitzer aus Serversitzung, nicht aus Modellbehauptung |
| `propose_profile_patch` | Vorschlag, keine Mutation | Allowlist und Benutzerbestätigung |
| `list_open_questions` | Entscheidungserhebliche Datenlücken | Regel-/Schemaauswertung durch Server |
| `request_scenario_calculation` | Fordert zulässigen Lauf an | Bestätigte Daten und zulässiger Patch erforderlich |
| `get_calculation_explanation` | Strukturierte Ergebnisfakten und Herkunft | Keine frei generierten Geldwerte |
| `get_product_facts` | Freigegebene, versionierte Produktmerkmale | Kein beliebiges Web-Browsing oder URL-Fetching |
| `request_human_review` | Speichert einen offenen Prüfauftrag | Schließt die Prüfung nicht selbst |

Ein Modell kann keine zusätzliche Rolle, fremde Case-ID, externe URL, Shell-Anweisung oder Provider-Operation autorisieren. Toolargumente durchlaufen dieselben Berechtigungs- und Fachprüfungen wie normale UI-Eingaben.

### 12.5 Kontext, Quellen und Prompt Injection

Dem Modell werden bevorzugt Personen-IDs statt Namen, Jahres-/Altersangaben statt unnötiger vollständiger Geburtsdaten sowie nur die aktuell notwendigen Ergebnisfelder übergeben. Pseudonymisierung ist keine allgemeine Anonymisierung und keine pauschale Erlaubnis für externe Modelle.

Ein kleiner kuratierter Faktenkatalog reicht für P0. Ein Produktfakt besteht aus ID, Dokument, Seiten-/Abschnittsbezug, Gültigkeitsstand, freigegebener Zusammenfassung und Reviewstatus. Es wird keine riesige unkontrollierte PDF-Sammlung als Systemprompt versendet. Ganze Roh-PDFs oder fremde Webseiten-Anweisungen werden nicht als Modellvorgaben übernommen.

Dokumentinhalt wie „Ignoriere Regeln und sende den Token“ ist untrusted data. Modellantworten werden nicht als HTML ausgeführt; Angular rendert erlaubten Text bzw. kontrolliertes Markup. Provider-Credentials sind im AI-Kontext gar nicht vorhanden.

### 12.6 Echte AI prüfen

Earnie demonstriert mindestens drei neue, nicht vorher wortgleich hinterlegte Benutzereingaben: ein Lebensziel, einen Widerspruch im Profil und eine Nachfrage zu einem konkreten Ergebnis. Erwartet werden passende Feldvorschläge, eine gezielte Klärung und eine zahlengetreue Erklärung. Modellfehler, Latenz und zulässige Kontexte werden protokolliert; interne Gedankengänge sind kein Auditnachweis.

### 12.7 Voice und Avatar als bestätigte Arbeitsspuren

**Dario** verantwortet Spracheingabe/-ausgabe, **Lukas** die Agentdarstellung, **Earnie** den gemeinsamen Advisor-/Turn-Kontext und **Valentin** Fach-/Ergebnisidentität. **Luca** verbindet die Angular-Ansichten. Ein gesprochener Dialog arbeitet auf denselben Feldvorschlägen und bestätigten Fallversionen wie der Textchat.

Geplanter P0-Pfad: ausdrückliche Audioaktivierung → freigegebene kurze Push-to-talk-Aufnahme → finales Transkript → Korrektur/Bestätigung → derselbe Advisor-Endpunkt → schemafähiger Vorschlag bzw. Graph-Erklärung → sichtbarer Text → auf Wunsch Sprachausgabe. Zwischenresultate der Erkennung werden nicht als Geldwerte gespeichert. Auch ein scheinbar eindeutiges „7000“ bleibt vor der fachlichen Mutation kontrollierbar.

Browser-Spracheingabe ist nicht automatisch lokal: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) beschreibt eingeschränkte Verfügbarkeit und serverbasierte Erkennung in manchen Browsern. Deshalb wird zuerst ein zulässiger STT-Adapter und Demo-Browser festgelegt; es gibt keinen stillen Cloud-Fallback. [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) erfordert passende sichere Kontexte und Nutzerfreigabe. Die App fordert keine Kamera an.

Für TTS werden lokale oder ausdrücklich freigegebene Stimmen ausgewählt. Die Eigenschaft [`localService`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService) hilft bei der Unterscheidung; sie ersetzt kein vollständiges Daten-/Anbieterkonzept. Audioformat, Größe, maximale Dauer und temporäre Verarbeitung sind vor einem serverseitigen Speech-Pfad festgelegt. Rohaufnahmen werden nicht dauerhaft als allgemeines Debugmaterial gespeichert.

Lukas erhält nicht eine zweite AI, sondern ein Darstellungsobjekt:

```ts
type AgentPresentation = {
  turnId?: string;
  explanationId?: string;
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  progress: { domain: 'data_capture'; percent: number | null; openGroups: string[] };
  reviewOpen: boolean;
  locale: string;
  statusText: string;
};
```

Aufnahme, Modell-/Rechenanfrage und tatsächlicher Audiostart erzeugen jeweils passende Ereignisse. Ein fertig generierter Text setzt den Agenten noch nicht auf `speaking`. Stop, Auswahlwechsel und neue Fallversion widerrufen den betreffenden Turn; alte Callbacks dürfen nichts wieder aktivieren. In P0 wird während eigener Sprachausgabe nicht gleichzeitig weiter aufgenommen, damit kein unkontrollierter Echo-Dialog entsteht. Anspruchsvolles Vollduplex/Barge-in ist eine spätere Erweiterung.

Avatar- und Audioausfall blockieren weder Grafik noch Chat noch Summary. Der grundlegende Agent bleibt ein einfacher Renderer. Erst nach vollständigem P0 kann Lukas einen freigegebenen Video-Renderer ergänzen; dessen Ausfall muss auf die einfache Darstellung zurückfallen. Ein laufender Video-Avatar ist kein Nachweis für korrekte Beratung, Verständnis oder bestehende Versicherungsdeckung.

## 13. Handlungsoptionen und Pax-Produktregeln

### 13.1 Zuerst die Maßnahme, dann das Produkt

Das System ermittelt zuerst Bedarf und Entscheidungsspielraum: Liquiditätsreserve aufbauen, Daten vervollständigen, bestehende Deckung nutzen, Arbeits-/Sparziel ändern, Risiko gezielt absichern oder Alterskapital bilden. Erst anschließend wird geprüft, welche freigegebene Pax-Produktfamilie passen könnte.

Keine pauschale Gesamtpunktzahl darf eine fachliche Sperre überstimmen. Eine gute Renditechance kann fehlende Tragbarkeit oder einen unpassenden Anlagehorizont nicht ausgleichen.

### 13.2 Kleiner P0-Katalog mit nachvollziehbarer Begründung

| Bedarf | Produktfamilien, die geprüft werden können | Vorher zwingend klären | Typische Alternative |
|---|---|---|---|
| Regelmäßige Einkommenslücke bei Erwerbsunfähigkeit | Pax Erwerbsunfähigkeitsversicherung / belegte passende Zusatzdeckung | Ursache, bestehende Leistungen, Wartefrist, Ausschlüsse, Finanzierung | Arbeitgeber-/PK-Daten klären oder bestehende Deckung überprüfen |
| Kapitalbedarf Hinterbliebener | Pax Todesfallversicherung | Bedarf über die Zeit, Begünstigung, bestehendes Kapital, Laufzeit | Rücklage, bestehende Police oder andere Nachlassmaßnahme prüfen |
| Langfristiger Alterskapitalaufbau mit Versicherungskomponente | LifeStar/FondsStar nach Fakten- und persönlicher Prüfung | Tragbarkeit, Anlageziel, Horizont, Risikoprofil, Kosten, Rückkauf, Garantie | Liquidität erhalten, Sparziel ändern oder vorerst kein Versicherungsprodukt |
| 3a-Konfiguration | Pax 3a als eigene Produktkonfiguration, wenn hinreichend geprüft | Berechtigung, Beitragsrahmen, Bindung und konkreter Vertrag | Bestehende 3a-Lösung weiterführen oder Informationsbeschaffung |
| Bereits vorhandenes Kapital im Ruhestand | Pax Auszahlungsplan als weiterführende Option | Zeitliche Befristung, garantierte/fondsabhängige Auszahlungen, Entnahmeziel | Kontrollierter Kapitalverzehr bzw. andere fachlich geprüfte Lösung |

Für P0 werden maximal drei Familien tatsächlich in der Auswahlstrecke vertieft: Erwerbsunfähigkeit, Todesfall und eine zum Hauptfall passende Spar-/Vorsorgefamilie. Der übrige Katalog bleibt sichtbar dokumentierte Erweiterung. Kinderversicherung wird nicht allein deshalb vorgeschlagen, weil Kinder vorhanden sind. Pax Care wird nicht als Lösung großer langfristiger Versorgungslücken ausgegeben.

### 13.3 Regelobjekt und Erklärung

Eine Produktregel besitzt ID, Version, Gültigkeitsbereich, benötigte Eingaben, Ausschluss-/Prüfbedingungen, Quellen und eine verständliche Begründungsvorlage. Jede Empfehlung enthält:

- das konkrete Ziel und die zugrunde liegende Lücke;
- die zugehörigen aktuellen `CalculationRun`-IDs;
- welche Merkmale der Produktfamilie zum Bedarf passen;
- welche Variante, Kosten-/Garantieangaben und Bedingungen noch offen sind;
- die Abwägung gegen eine Alternative ohne neuen Vertrag;
- den nach der Maßnahme verbleibenden Bedarf;
- benötigte persönliche Angemessenheits- oder Fachprüfung.

Eine beobachtete kleine Lücke wird nicht einfach auf null gerundet, um keine Empfehlung zu erzeugen. Wenn eine fachlich bestätigte Mindestdeckung oder Verhältnismäßigkeitsregel dagegen spricht, ein Produkt vorzuschlagen, bleiben Lücke, Regel und Entscheidung sichtbar. Genau diese Konsistenz ist ein Abnahmepunkt aus dem vlot-Test.

### 13.4 Fakten, die im Katalog sauber getrennt werden

Garantie und Projektion; Brutto- und aktuell ermäßigte Prämie; Spar-, Risiko- und Kostenanteile; Laufzeit und lebenslange Leistung; Beitrag und Rückkaufswert; 3a- und 3b-Bindung; Krankheit und Unfall; Basisinformationsblatt und Werbebroschüre. Die begrenzte Befreiung bei Familienzuwachs wird nicht zur pauschalen Weiterzahlung aller Sparprämien umformuliert.

Bei Widersprüchen zwischen Quellenständen entsteht ein Reviewpunkt. Die AI darf keine vermeintlich aktuelle Tarifbedingung ergänzen. Produktname, Dokumentdatum und Quelle werden im Dossier gespeichert.

## 14. Persönliche Angemessenheit und menschliche Prüfung

Die Haushaltsrechnung ist keine individuelle Angemessenheitsprüfung. Das archivierte [Pax-Formular](../../challenge_material/) betrachtet unter anderem persönliche finanzielle Situation, Anlageziele, Erfahrung, Wissen und Risikobereitschaft; die konkrete Datei ist über den Quellenkatalog auffindbar. Ein Partnervermögen wird nicht ungeprüft als eigenes Vermögen der versicherungsnehmenden Person angerechnet.

P0 bietet eine klar bezeichnete Vorprüfung und übernimmt das offizielle Formular nicht als selbst erfundenen Punktetest. Die digitale Verbindlichkeit und erforderliche unveränderte Verwendung bzw. ein freigegebenes digitales Äquivalent werden mit Pax geklärt.

| Auslöser | Automatische Wirkung | Nächster sinnvoller Schritt |
|---|---|---|
| Bedarf oder entscheidende Unterlagen fehlen | Betroffene Empfehlung nicht final freigeben | Genau die fehlenden Informationen anfordern |
| Ungeklärter Provider-Ergebniscode | Ergebnis mit Reviewstatus | Technische/fachliche Rückfrage statt Leistungszusage |
| Persönliches Budget trägt die Verpflichtung nicht | Spar-/Prämienvorschlag blockieren | Betrag/Ziel anpassen oder keine neue Verpflichtung |
| Hohe Auswirkungen oder komplexe Begünstigung | Menschlicher Prüfauftrag | Kriterien und Zuständigkeit mit Pax festlegen |
| Versicherungs-/Finanzwissen reicht für Produktentscheidung nicht | Erklärschritt und gegebenenfalls Übergabe | Verständnis bestätigen lassen, keine automatische Punktfreigabe |
| Medizinische Frage oder echte Gesundheitsangabe | Keine automatische Annahmeentscheidung | Freigegebener separater Prüfprozess; Demo erfasst solche Daten nicht |
| Nutzer möchte eine Person sprechen | Prüf-/Übergabeauftrag ermöglichen | Dossier mit bestätigten Daten und offenen Fragen bereitstellen |

Die Übergabe ist eine echte App-Funktion: gespeicherter Auftrag, konkrete Fragen, Lesesicht auf die relevanten Versionen und ein sichtbarer Status. Eine Telefonnummer allein reicht als funktionaler Demonstrator nicht. Ein tatsächlicher Terminversand oder eine Nachricht an Pax ist kein Bestandteil dieses Plans ohne gesonderten Auftrag.

## 15. End-to-End: Offerte, Antrag und Demo-Police

### 15.1 Zwei getrennte Statusachsen

Der Beratungsstatus betrifft Reife und Prüfung. Der Antragsstatus betrifft den Vertragsprozess. Sie werden nicht zu einem einzigen Boolean `done` zusammengelegt.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> ProfileConfirmed
  ProfileConfirmed --> AnalysisAvailable
  AnalysisAvailable --> ReviewRequired
  ReviewRequired --> RecommendationReady: Demo-Reviewer bestaetigt
  AnalysisAvailable --> RecommendationReady: keine offene Pflichtpruefung
  RecommendationReady --> DemoQuoteCreated
  DemoQuoteCreated --> DemoApplicationDraft
  DemoApplicationDraft --> DemoSubmitted: Angaben und Versionen bestaetigt
  DemoSubmitted --> DemoUnderReview
  DemoUnderReview --> DemoNeedsInformation
  DemoNeedsInformation --> DemoUnderReview: ergaenzte Angaben geprueft
  DemoUnderReview --> DemoAccepted: berechtigter Demo-Pruefschritt
  DemoUnderReview --> DemoDeclined
  DemoAccepted --> DemoPolicyIssued
```

Jeder Sales-Status und jedes entsprechende Dokument trägt ein Demo-Kennzeichen. Der Wechsel in den Demo-Reviewmodus ist eine eigene Berechtigung, keine Handlung des AI-Modells. Eine echte rechtliche Annahme oder Versicherbarkeit wird nicht simuliert, ohne sie als Simulation kenntlich zu machen.

### 15.2 Vorbedingungen für Übergänge

| Übergang | Erforderlicher Nachweis | Bei Verletzung |
|---|---|---|
| Profil bestätigen | Pflichtdaten und explizite Annahmen geprüft | Konkrete offene Felder zurückgeben |
| Empfehlung bereit | Aktuelle Rechenläufe und erledigte erforderliche Fachprüfung | `review_required` oder `needs_input` |
| Demo-Offerte erstellen | Aktuelle Empfehlung und erlaubte Produktkonfiguration | Keine generierte Schein-Offerte |
| Demo-Antrag starten | Nicht abgelaufene bzw. nicht veraltete Demo-Offerte | Neuprüfung/Neuberechnung verlangen |
| Demo-Antrag einreichen | Daten-/Dokumentversionen bestätigt, benötigte Demo-Prüfschritte erfüllt | Fehlende Schritte sichtbar lassen |
| Demo-Annahme | Berechtigte, protokollierte Demo-Reviewer-Aktion | AI- oder Kundenaktion allein reicht nicht |
| Demo-Police ausstellen | Passende Demo-Annahme und unveränderte Konfiguration | Kein direktes Setzen von `policyIssued=true` |

### 15.3 Demo-Offerte ist kein behaupteter Tarifpreis

Ohne freigegebene Tarif-API besteht die Demo-Offerte aus einer klar bezeichneten Testkonfiguration mit entweder einem ausdrücklich erfundenen Preis oder einem nicht verfügbaren Preisfeld. Bestehende Muster-Offerten dürfen als gekennzeichnete Dokumentreferenzen gezeigt werden; ihr Preis wird nicht auf die Demo-Person übertragen. Für die Hauptdemo ist ein nachvollziehbarer Betrag nur dann vorhanden, wenn seine Demo-/Quellenherkunft vollständig erkennbar ist.

Die echte spätere Anbindung erhält ein `QuoteProvider`-Interface. P0 verwendet `DemoQuoteProvider`. Ein Quicksale-Link oder ein Browser-Scraping-Bot ist keine stabile Sales-API und wird nicht als Produktionsintegration gebaut.

### 15.4 Keine echte Unterschrift in der Demo

Die UI zeigt einen „Demo-Bestätigung“-Schritt und einen getrennten „in echter Integration: Signaturdienst“-Platzhalter. Es wird keine echte Unterschrift gezeichnet, kein Ausweis hochgeladen und kein Versicherungsprodukt aktiviert. Identifizierung, erforderliche Gesundheitsprüfung, Begünstigung und Geldwäschereiprüfung sind fachliche Integrationsgrenzen, keine durch ein Checkbox-Icon erledigten Verfahren.

### 15.5 Portal und Dokumente

Die Portalansicht zeigt eine gespeicherte Übersicht über Beratungsfall, Demo-Antrag, Reviewstatus und gegebenenfalls Demo-Police. Ein Neuaufruf lädt den Stand aus der Datenbank. Die Demo-Police enthält Fall-/Antragsreferenz, Testkonfiguration, Status, Zeitpunkte und eine unübersehbare Kennzeichnung ohne Versicherungsdeckung.

P0 liefert ein gemeinsames SummaryBundle mit Kunden-/Fachpersonensicht als JSON und druckbare HTML-Sicht. Beide Sichten enthalten denselben Snapshot, offene Fragen und Prüfstatus. Die Übergabe wird vorbereitet, nicht automatisch per E-Mail oder Nachricht ausgelöst. Der genaue Begriff „Candidate“ und der reale Empfängerkanal bleiben offen. Ein serverseitiges PDF ist P1, sofern der Hauptpfad vorher funktioniert. Das Dossier enthält dieselben Zahlen und Reifegrade wie die App, keine separat zusammengetextete „finale“ Darstellung. Der bereits heruntergeladene vlot-Bericht bleibt fremde Referenz und wird nicht als LifeMap-Dossier umetikettiert.

## 16. Workshop-Schnittstellen und eigene API-Verträge

Die [Workflow-/Schnittstellenspezifikation](interface-contracts.md) konkretisiert das zweite Foto mit **I01 VoiceLog, I02 CaseSnapshot, I03 AnalysisRequest, I04 AnalysisResult, I05 AgentReply, I06 VoicePlaybackEvent, I07 GraphExplanationRequest, I08 SummaryBundle und I09 ProgressSnapshot**. Die [JSON-Übersicht](../catalog/interface-contracts.json) ist eine maschinenlesbare Planungsbeschreibung, kein bereits vollständiges Runtime-Schema. Codeowner-Namen verleihen keine Laufzeitberechtigung.

Die Versionen sind getrennt: Fallrevision für konkurrierende Writes; Profil-/Szenario-/Input-Hash für Berechnung; Turn-/Kontext-/Run-Bezug für Erklärung und Audio. Nur so löst eine harmlose Tempoänderung keine unnötige Neuberechnung aus, während ein neuer Lohn alte Rechenergebnisse tatsächlich veraltet.

Alle folgenden Pfade sind **vorgeschlagene eigene App-Endpunkte**, keine existierenden Pax-Endpunkte. Sie liegen unter einer gemeinsamen Origin mit dem Angular-Client. Jede Falloperation prüft die Sitzung und den Besitzer erneut.

| Methode / Pfad | Zweck | Wesentliche Vorbedingung |
|---|---|---|
| `POST /api/demo-sessions` | Geschützte Demo-Sitzung eröffnen | Servergeprüfter Zugang, sichere Session |
| `POST /api/cases` | Eigenen Fall aus erlaubter Vorlage anlegen | Vorlage auf serverseitiger Allowlist |
| `GET /api/cases/:caseId` | Aktuellen berechtigten Fall lesen | Keine Daten fremder Fälle |
| `PATCH /api/cases/:caseId/draft` | Eingaben am Entwurf ändern | Erwartete Version und erlaubte Felder |
| `POST /api/cases/:caseId/confirmations` | Neue bestätigte Profilversion | Kritische Angaben/Annahmen bestätigt |
| `POST /api/cases/:caseId/scenarios` | Szenarioentwurf erzeugen | Gültige Baseline-ID |
| `POST /api/cases/:caseId/calculations` | Bestimmte Variante berechnen | Pflichtdaten, zulässiger Modus, Idempotenz |
| `GET /api/cases/:caseId/calculations/:runId` | Passendes Ergebnis lesen | Run gehört zum berechtigten Fall |
| `POST /api/cases/:caseId/advisor/messages` | AI-Vorschlag/Erklärung | Begrenzter Kontext und erlaubte Werkzeuge |
| `POST /api/cases/:caseId/recommendations` | Regelbasierte Vorschläge erzeugen | Aktuelle Runs und dokumentierte Sperren |
| `POST /api/cases/:caseId/reviews` | Menschliche Prüfung anfordern | Grund und referenzierte Versionen |
| `POST /api/cases/:caseId/reviews/:reviewId/decisions` | Demo-Prüfung protokollieren | Reviewer-Rolle, kein AI-Selbstabschluss |
| `POST /api/cases/:caseId/demo-quotes` | Demo-Offerte erstellen | Aktuelle Empfehlung |
| `POST /api/cases/:caseId/demo-applications` | Demo-Antrag erzeugen | Aktuelle Offerte |
| `POST /api/cases/:caseId/demo-applications/:id/submit` | Demo-Antrag einreichen | Bestätigungen und unveränderte Eingaben |
| `POST /api/cases/:caseId/demo-applications/:id/decisions` | Demo-Annahme/Rückfrage/Ablehnung | Berechtigter Demo-Prüfschritt |
| `GET /api/cases/:caseId/portal` | Portal-Daten einschließlich Demo-Police | Nur eigener berechtigter Fall |
| `POST /api/cases/:caseId/explanations` | Auswahlgebundene Grafik-Erklärung | GraphContext gehört zu aktuellem berechtigtem Fall/Run |
| `POST /api/cases/:caseId/summaries` | Kunden-/Fachpersonensicht desselben Snapshots | Berechtigter Snapshot, kein automatischer Versand |
| `POST /api/cases/:caseId/voice/transcriptions` | Optional: freigegebener temporärer STT-Adapter | Explizite Aufnahme, Format-/Größenlimit, bekannte Empfänger |
| `GET /api/cases/:caseId/advisor/context` | Aktuellen minimalen Sprach-/Gesprächskontext laden | Session/Fallbindung, aktuelle Version, erlaubte Fakten |
| `GET /api/cases/:caseId/advisor/events` | I10-Kontextänderungen an berechtigte Clients melden | SSE-Vorschlag, Ablauf/Widerruf, Reconnect-Snapshot |
| `GET /api/cases/:caseId/dossier` | JSON-/HTML-Dossier | Reifegrade und Versionen erhalten |

### 16.0 Dynamischer Voice-Kontext aus dem gemeinsamen JSON-Fall

Earnies Fallservice hält den kanonischen JSON-Fallstand und erzeugt eine minimale `AdvisorContext`-Projektion. Dario wird über I10 aktualisiert und prüft vor jedem fachlichen Antwortturn Kontext-/Runbezug erneut. Ein neues gültiges Resultat von Valentin wird Grafik und Gespräch verfügbar; fachlich veraltete Audioausgaben werden abgebrochen und Lukas erhält `cancelled`. Vorschlag: HTTP für Eingaben, SSE für fallbezogene Updates. Nach Reconnect frischen Snapshot laden, doppelte Events ignorieren. `contextRevision` ist gesondert von der fachlichen `profileVersion`. Vollständiger Ablauf, Werkzeugoption und Zuständigkeiten: [Schnittstellen Abschnitt 9](interface-contracts.md#9-gemeinsame-json-und-dynamischer-gesprächskontext-für-dario).

### 16.1 Beispiel für den Rechenauftrag

```json
{
  "profileVersion": 3,
  "scenarioVersionId": "scenario-family-2",
  "requestedAreas": ["budget", "risk", "retirement"],
  "executionMode": "live-demo"
}
```

Der Server akzeptiert keine vom Client erfundene Eigentümer-ID. Der Auftrag enthält keine frei wählbare Provider-URL oder einen Bearer-Token. Zur Antwort gehören `runId`, Versionen, Status pro Ergebnisbereich, Werte, Quellen und offene Fragen.

### 16.2 Fehlervertrag

```json
{
  "code": "NEEDS_INPUT",
  "message": "Das bestaetigte monatliche Zielbudget fehlt.",
  "fields": ["budget.targetMonthly"],
  "retryable": false,
  "traceId": "safe-trace-reference"
}
```

Geplante HTTP-Konvention: 400 für kaputte Struktur, 401 für fehlende Sitzung, 403 für fehlende Rolle, 404 für nicht zugängliche/nicht vorhandene Ressource ohne fremde Falldetails, 409 für Versions-/Idempotenzkonflikt, 422 für fachlich nicht erfüllte Vorbedingungen, 429 für Begrenzung und 502/503 für Providerprobleme. Der Client zeigt einen handlungsfähigen Text statt Rohantworten mit internen Details.

## 17. Persistenz, Versionierung und zuverlässige Wiederaufnahme

### 17.1 Kleiner gespeicherter Kern

Tabellen-/Aggregatevorschlag: `sessions`, `cases`, `profile_versions`, `scenario_versions`, `calculation_runs`, `recommendations`, `review_tasks`, `quotes`, `applications`, `policies`, `audit_events`. Für P0 können Kindobjekte eines unveränderlichen Profils in validierten JSON-Strukturen liegen; Besitzer, Status, Versionen und zentrale Referenzen bleiben explizit indexierbar.

Das Backend verwendet parameterisierte Datenzugriffe bzw. sichere ORM-Bindings. Datenbankmigration und Seed sind versioniert. Entwickler-Fixtures enthalten keine realen Zugangsdaten oder Originalausweise.

### 17.2 Was bei Änderungen passiert

Ein bestätigter Fall wird nicht in-place umgeschrieben. Eine Änderung erzeugt eine neue Profil- bzw. Szenarioversion. Betroffene Ergebnisse werden als `stale` markiert; die alte Ansicht bleibt als historischer Vergleich erhalten. Neue Empfehlungen referenzieren neue Läufe. Alte Offerten werden nicht unter gleichem Namen mit neuen Zahlen befüllt.

Writes nutzen eine erwartete Versionsnummer oder ETag. Zwei Browseraktionen auf denselben veralteten Entwurf führen zu einem 409-Konflikt mit Wiederladeoption, nicht zum stillen Überschreiben.

### 17.3 Idempotenz und Transaktionen

Rechenauftrag, Demo-Antragseinreichung und Ausstellung einer Demo-Police besitzen einen fallbezogenen Idempotenzschlüssel. Derselbe Schlüssel mit gleichem Payload liefert denselben Vorgang. Derselbe Schlüssel mit anderem Payload wird abgelehnt. Eine Datenbank-Unique-Constraint schützt vor Doppelanlagen auch dann, wenn zwei Requests gleichzeitig eintreffen.

Statusänderung und zugehöriges Auditereignis werden gemeinsam gespeichert. Ein Provider-Ausfall führt nicht zu einer halben Datenbanktransaktion über mehrere Sekunden; Auftrag und Resultat werden mit klaren Statusschritten getrennt verwaltet.

### 17.4 Berechtigung im Datenzugriff

Jeder Repository-Zugriff wird an Sitzung/Besitzer und Case-ID gebunden. Datenbankseitige Row-Level Security ist eine zusätzliche Option, falls sie sauber mit der genutzten Verbindung eingerichtet und getestet werden kann. Sie ersetzt keine App-Prüfung. PostgreSQL weist darauf hin, dass Owner- und privilegierte Rollen RLS umgehen können; ein als Superuser laufender App-Prozess würde deshalb falsche Sicherheit vermitteln. [Offizielle Referenz](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

P0-Abnahme ist ein bewiesener Zugriffsschutz zwischen zwei Sitzungen. Ein bloßes Vorhandensein einer RLS-Policy oder eines Angular-Guards ist kein ausreichender Nachweis.

## 18. Datenschutz und Sicherheit vom ersten Slice an

### 18.1 Konkrete Datenwege statt eines Compliance-Labels

Der Challenge-Rahmen verlangt transparente Verarbeitung, kontrollierte AI-Nutzung, Erklärbarkeit, Zugriffsschutz, Logging und Verschlüsselung. Diese Punkte sind Anforderungen an die Umsetzung. Der Plan oder eine Schweizer Serverregion allein bestätigen keine DSG-/FADP-Konformität.

Der EDÖB hält fest, dass Datenschutz auch auf AI-Systeme anwendbar ist und dass Zweck, Datenquellen und AI-Einsatz verständlich offenzulegen sind. Daraus werden hier transparente Hinweise und nachvollziehbare Datenwege abgeleitet; eine juristische Freigabe ersetzt das nicht. [EDÖB: KI und Datenschutz](https://www.edoeb.admin.ch/de/ki-und-datenschutz).

| Daten | P0-Verarbeitung | Was unterbunden wird |
|---|---|---|
| Synthetisches Profil | Eigene geschützte App und Fall-Datenbank | Unbemerkte Weitergabe an Analytics oder beliebige Modellanbieter |
| Rechenparameter | Nur benötigte Felder an freigegebenes Logismata-Ziel | Gesamtes Gespräch oder unnötige Namen als API-Beifang |
| AI-Kontext | Minimierter Kontext an die konfigurierte freigegebene Umgebung | Dynamisch vom Modell gewählte Hosts oder unbekannte Proxies |
| Sprache/Transkript | Kurze explizite Aufnahme, freigegebener STT-/TTS-Weg, bestätigbare Werte | Mikrofon-Autostart, Kameraanforderung, unbemerkte Cloud-Erkennung und dauerhafte Rohaufnahme |
| Rohdokumente | P0 kein freier Upload; P1 zunächst nur synthetische Dokumente | Allgemeine Cloud-OCR mit nicht geklärter Datennutzung |
| Gesundheits-/Ausweisdaten | Für die Hauptdemo nicht erhoben | Speicherung „für später“ ohne konkrete Notwendigkeit |
| Logs | Trace-ID, technischer Status, Operation, Dauer und Version | Tokens, Rohtexte, detaillierte finanzielle Payloads und Dokumentinhalte |
| Produkt-/Regelfakten | Kuratierte Quelle und Version | Unkontrollierte Modellbehauptung als Produktbedingung |

### 18.2 Zugriff und Session-Schutz

Für die Vorführung: ein serverseitig geschützter Zugang mit isolierten Sitzungen. Ein gemeinsam bekannter Zugangscode allein berechtigt nicht zum Lesen aller bereits angelegten Fälle. Falls Pax OIDC bereitstellt, bleibt ein klarer Adapterpunkt dafür; die Hackathon-Demo baut keinen eigenen vollständigen Identity Provider.

Sessions sind kurzlebig und serverseitig widerrufbar. Über das Netzwerk werden sichere HttpOnly-Cookies mit passender SameSite-/Secure-Konfiguration verwendet. Mutation-Endpunkte prüfen Origin und geeigneten CSRF-Schutz. Produktive CORS-Freigaben sind ausdrücklich eingeschränkt; beliebige Origins werden nicht erlaubt. Das Rate Limit betrifft teure Modell-/Rechenpfade und Loginversuche.

Lokale Entwicklung ausschließlich über Loopback ist von der Netzwerkvorführung zu unterscheiden. Für den Zugriff von anderen Geräten ist HTTPS vorgesehen. Eine öffentliche Bereitstellung, Domain oder ein echter Anbieterzugang wird durch diesen Plan noch nicht eingerichtet.

### 18.3 Verschlüsselung und Schlüssel

Für die Netzwerk-Demo: TLS am Zugang; verschlüsselte persistente Datenträger und eine geprüfte Konfiguration der Datenbankverbindung. Für schützenswerte Fall-Payloads ist zusätzlich eine etablierte serverseitige AEAD-Verschlüsselung, z. B. AES-GCM mit eindeutiger Nonce, geplant. Der Schlüssel liegt außerhalb von Git und außerhalb der verschlüsselten Datensätze. Es wird kein eigener Kryptografiealgorithmus entworfen.

Die konkrete Entwicklungsumgebung muss ihre Datenträgerverschlüsselung tatsächlich nachweisen oder vor der entsprechenden Nutzung abgesichert werden. „Läuft lokal“ ist kein Verschlüsselungsnachweis. Der Abnahmetest prüft, dass ein gespeicherter Test-Klartext nicht als unverschlüsselter sensibler Payload in der vorgesehenen Datenbankablage liegt und dass unerlaubte Nutzer ihn nicht abrufen können.

Paket-, Modell- und Rechenanbieter-Schlüssel bleiben getrennt. Keine geheimen Werte in Angular-Environment-Dateien, Client-Bundles, Screenshots, Dossier-Exporten oder Beispielen. Vor Commit und Build gibt es einen Secret-Scan. Der vorhandene lokale Logismata-Zugang wird nicht in eine neue Datei kopiert, wenn eine kontrollierte Laufzeit-Zuordnung ausreicht.

### 18.4 Aufbewahrung und Berichtigung

Für synthetische Demo-Fälle wird eine kurze, konfigurierbare Aufbewahrung vereinbart, etwa Bereinigung nach der Veranstaltung. Das ist eine Teamregel, keine behauptete gesetzliche Frist. Realbetrieb benötigt ein mit Pax abgestimmtes Lösch-/Aufbewahrungs- und Rechtsgrundlagenkonzept. Historische Rechenversionen dürfen nicht dazu dienen, personenbezogene Daten unbegrenzt zu behalten.

Ein Kunde kann Angaben korrigieren und ihre Auswirkungen neu berechnen lassen. Auskunfts-, Export- und Löschprozesse werden als spätere Produktpflichten konkret zugeordnet; P0 beweist mindestens korrekte Fallzuordnung, Exportumfang und technische Löschbarkeit synthetischer Testdaten. Niemand löscht während dieses Planungsschritts echte Repo- oder Kundendaten.

### 18.5 Menschliche Überprüfung und Transparenz

Die Oberfläche informiert vor der Erfassung über Zweck, Empfänger und AI-Einsatz. Informationshinweise und eine gegebenenfalls erforderliche Einwilligung sind getrennte Dinge; eine pauschale Checkbox wird nicht als vollständige Rechtsgrundlage für jede Verarbeitung behandelt.

Automatisierte Entscheidungen mit erheblichen Auswirkungen werden mit Pax rechtlich eingeordnet. Der PoC baut keine autonome Annahme- oder Ablehnungsentscheidung über reale Personen. Ein gespeicherter Prüfauftrag und verständliche Gründe bereiten menschliche Überprüfung vor. [EDÖB: Informationspflicht](https://www.edoeb.admin.ch/de/informationspflicht).

### 18.6 Minimale Bedrohungsfälle

Fremde Case-ID, Zugriff auf einen fremden Download, manipulierte Client-Statusänderung, wiederholtes Einreichen, Token im Bundle, Prompt Injection aus Text, Modell-Toolzugriff mit fremder Rolle, XSS in einer Erklärung, überlange Modellanfrage und Provider-Antwort mit ungültigen Zahlen. Diese Fälle sind eigene Abnahmepunkte, keine nur theoretische Liste für nach dem Hackathon.

## 19. Dossier, Audit und nachvollziehbare Entscheidungen

Das Beratungsdossier referenziert Profil, Ziele, Budget, Säulen, Annahmen, Szenarien, Rechenläufe, Empfehlung, Alternativen, Prüfungen und Demo-Vertragsstatus. Jede Ebene ist auch ohne Chatverlauf verständlich.

Ein Entscheidungseintrag enthält `ruleId`, Version, benötigte Daten, ausgewertete Bedingung, sachlichen Grund, referenzierte Rechenergebnisse und Zeitpunkt. Interne Modellgedanken oder eine lange freie Begründung ersetzen diese Struktur nicht.

Pro Statusübergang wird gespeichert: wer hat was an welcher Objektversion wann ausgelöst, welche Vorbedingungen waren erfüllt und welches Ergebnis entstand? Ein fehlgeschlagener Versuch kann ein technisches Auditereignis erzeugen, ohne sensible Eingaben zu protokollieren.

Audit-Logs sind nur für berechtigte Rollen zugänglich. Eine Hashkette kann Manipulationen sichtbar machen, ist allein aber kein revisionssicheres Archiv, wenn dieselbe privilegierte Person alle Anker neu schreiben kann. Für P0 genügt ein konsistenter, geschützter Ereignisverlauf; produktive Revisionsanforderungen werden mit Pax festgelegt.

**Konkreter Nachweis:** Der Reviewer öffnet eine Empfehlung und sieht die verwendete Profilversion, Bedarfslücke, Regel-ID, Quelle, offene Annahmen und Entscheidung. Nach einer Änderung erkennt er, warum die alte Offerte nicht mehr aktuell ist.

## 20. Teststrategie und verbindliche Abnahmematrix

### 20.1 Drei unterschiedliche Referenzarten

1. **Technische Vertragsfälle:** Die 24 archivierten API-Beispiele prüfen Mapper, Einheiten und Antwortnormalisierung. Sie werden nicht während jeder CI-Ausführung live erneut abgefragt.
2. **Fachliche Referenzfälle:** Nur Fälle mit dokumentierten identischen Annahmen dürfen quantitativ verglichen werden. Die unabhängige vlot-Analyse ist keine allgemeine numerische Oracle für Logismata.
3. **Eigene Produktinvarianten:** Unbekannt bleibt unbekannt, Kapital wird nicht doppelt verwendet, veraltete Ergebnisse sind gesperrt und erforderliche Reviewrollen lassen sich nicht umgehen.

Unit-Tests konzentrieren sich auf Regeln mit eigenem fachlichem Risiko. Kein Test wird nur geschrieben, um eine triviale Formatierungsfunktion wortgleich nachzuerzählen. Für die gesamte Journey gibt es wenige aussagekräftige Integration-/Browser-Tests.

### 20.2 Pflichtfälle

| ID | Test | Erwartetes Verhalten | Hauptverantwortung |
|---|---|---|---|
| V01 | Zukunftsgeburtsjahr / unzulässiger Alterswert | Fehler am Feld; kein Provider-Aufruf mit ungültigen Daten | Luca + Valentin |
| V02 | Fehlendes Brutto-/Netto-Kennzeichen | Rückfrage; keine stille Einkommensumrechnung | Valentin |
| V03 | Bedarf unbekannt | Keine Aussage „keine Lücke“ und keine finale Bedarfs-Empfehlung | Valentin + Earnie |
| V04 | Einkommen null versus unbekannt | Zwei verschiedene fachliche Zustände | Valentin |
| V05 | Zu hohe 3a-Einzahlung | Gelieferte Grenzen prüfen; individuelle Berechtigung nicht allein daraus ableiten | Valentin |
| V06 | Einkommen unter fachlicher Grenze der Umrechnung | Keine künstliche Erhöhung auf Mindestwert; eingeschränkter Pfad | Valentin |
| C01 | Dieselben Eingaben und dieselbe Modellversion | Deterministischer eigener Anteil und gleiche Input-Hashes | Valentin |
| C02 | Monats-/Jahreswerte | Richtige Umrechnung ohne Mehrfachdivision | Valentin |
| C03 | Budget enthält bereits Steuern / Vorsorge | Kein doppelter Abzug | Valentin |
| C04 | API-Gesamteinkommen enthält Partner | Kein zweites Addieren von Partnereinkommen | Valentin |
| C05 | Risiko-Code 0 bei HTTP 200 | `requires_review`, nicht ungeprüft `valid` | Valentin + Team |
| C06 | 401 / Timeout / falsche Antwortstruktur | Begrenzter Fehlerpfad, keine Retry-Schleife | Valentin |
| S01 | Pensumswechsel | Neue Szenarioversion; Cashflow ändert sich; nicht belegte PK-Folge bleibt geschätzt/offen | Luca + Valentin |
| S02 | Eigenheim übersteigt verfügbare Mittel | Kapitalfehlbetrag und betroffene Reserve sichtbar | Luca + Valentin |
| S03 | Asset für Eigenheim und Pension gleichzeitig | Doppelzuordnung abgelehnt oder ausdrücklich alternative Varianten | Valentin |
| S04 | Früheres Erwerbsende | Kein Rest-Erwerbseinkommen; Überbrückung separat | Valentin |
| S05 | Rentenbeginn der Personen versetzt | Mindestens zwei korrekte Phasen | Valentin |
| S06 | Entnahmekapital erschöpft | Kein unbegrenzt fortlaufendes Einkommen aus diesem Asset | Valentin |
| A01 | Neue Lebensziel-Formulierung | Schemafähiger Vorschlag; keine ungefragte Profilmutation | Earnie |
| A02 | Widersprüchliche Nutzeraussage | Gezielte Klärung statt Überschreiben bestätigter Daten | Earnie |
| A03 | Frage zu Ergebnisbetrag | Antwort stimmt mit referenziertem Run und Periode überein | Earnie |
| A04 | Produktname gleich zu Beginn | Sachinformation möglich; persönliche Empfehlung bleibt an Bedarf gebunden | Earnie |
| A05 | Prompt verlangt Token / fremden Fall | Keine Offenlegung oder Tool-Autorisierung | Earnie + Valentin |
| A06 | Modellfehler oder unzulässige Ausgabe | Sichtbarer Fallback; keine erfundene Erfolgsantwort | Earnie |
| R01 | Kleine Lücke, keine passende Maßnahme | Lücke bleibt sichtbar; Entscheidung und gegebenenfalls Mindestregel erklärt | Earnie + Valentin |
| R02 | Haushalt hat Geld, betreffende Person nicht | Persönliche Angemessenheit bleibt ungeklärt | Earnie + Valentin |
| J01 | Profil nach Empfehlung geändert | Empfehlung und darauf beruhende Offerte veraltet | Earnie + Valentin |
| J02 | Antrag doppelt eingereicht | Eine konsistente Application-ID und ein Ereignis | Earnie + Valentin |
| J03 | Police direkt anfordern | Ohne passenden Annahmeschritt blockiert | Earnie + Valentin |
| J04 | Vollständige Journey mit Reload | Ein Fall bis zur Demo-Police; Daten und Status bleiben erhalten | alle fünf |
| J05 | Erforderliche menschliche Prüfung | AI-/Kundenrolle kann sie nicht selbst abschließen | Earnie + Valentin |
| P01 | Zwei Sitzungen / fremde Case-ID | Kein Lesen, Ändern oder Dossierdownload | Earnie + Valentin |
| P02 | Secret- und Bundle-Scan | Kein realer Anbieter-Token in Client, Git oder Export | Earnie + Valentin |
| P03 | Allgemeine Logs | Keine Rohdokumente, unnötigen Personen-/Finanzdaten oder Schlüssel | Earnie + Valentin |
| P04 | Manipulierter HTML-/Erklärungstext | Kein ausgeführtes fremdes Markup/Skript | Luca + Earnie |
| U01 | Tastatur und schmale Ansicht | Pflichtaktionen erreichbar; Fehler zugeordnet; Werte lesbar | Luca + Lukas |
| U02 | Dossier versus UI | Identische Beträge, Versionen und Prüfzustände | Earnie + Valentin |
| W01 | Kurzes Zeitbudget | Knappe Erklärung, aber unveränderte Pflichtdaten/-prüfungen | Luca + Earnie |
| W02 | Wechsel aller fünf Tabs | Fall, Szenario, Periode und Entwürfe bleiben erhalten | Luca + Earnie |
| W03 | Agentprogress bei offener Fachprüfung | Aufnahmefortschritt und Review/Versicherungsschutz bleiben getrennt | Lukas + Valentin |
| W04 | Erklärung nach neuer Grafikauswahl | Alter Run/Zeitraum wird nicht als aktuelle Erklärung vorgelesen | Luca + Valentin + Earnie |
| W05 | Mikrofon abgelehnt / Gerät fehlt | Textfluss funktioniert; kein wiederholter unerbetener Permission-Prompt | Dario |
| W06 | Verhörter Geldwert im Transkript | Korrektur/Bestätigung vor der fachlichen Mutation | Dario + Earnie |
| W07 | Stop / neue Fallversion beim Sprechen | Audio endet; alte Events aktivieren Agent/Voice nicht neu; kein Echo-Loop | Dario + Lukas |
| W08 | Ungeklärter Speech-Anbieter | Kein stiller Remote-STT-/TTS-Fallback | Dario + Earnie |
| W09 | Video-/Avatarfehler | Einfache Darstellung, korrekter Status, Beratung/Summary weiter nutzbar | Lukas + Dario |
| W10 | Kunden-/Fachperson-Summary | Derselbe Snapshot und Prüfstatus, keine widersprüchlichen Zahlen | Luca + Earnie |
| W11 | Summary-Export | Kein automatischer Mail-/Nachrichtenversand oder Termin | Earnie + Valentin |
| F01 | Dario → Earnie → strukturierter Stand → Valentin → Luca | Bestätigter Turn, Rechenauftrag und sichtbares Ergebnis haben passende gemeinsame Referenzen | alle fünf |
| F02 | Neue Finanzdaten bei verspätetem Resultat | Alter Input-Hash/Run ersetzt keine aktuelle Grafik oder Spracherklärung | Valentin + Luca + Earnie |
| F03 | Doppelte VoiceLog-/Antwortnachricht | Kein zweiter fachlicher Vorgang und keine doppelte Sprachausgabe | Dario + Earnie |
| F04 | Rückgabe und Avatar-Ereignisse | Zahlengetreue AgentReply, tatsächliches Audio und passender Playbackzustand | Earnie + Dario + Lukas |
| F05 | Neuer bestätigter JSON-Stand während eines Gesprächs | I10 aktualisiert Kontext; nächste Antwort nutzt freigegebene aktuelle Fakten; kein Rohakten-Prompt | Earnie + Dario + Valentin |
| F06 | Streamabbruch, doppelte Events und Wiederverbindung | Finanzantworten pausieren; aktuellen Snapshot laden; keine doppelte Sprachausgabe | Earnie + Dario + Luca |
| F07 | Fachänderung versus reiner Tempowechsel während TTS | Ungültige Aussage stoppen und Avatar abbrechen; unveränderte gültige Aussage bei Tempo allein erhalten | Dario + Lukas + Valentin |

### 20.3 Geplanter Test-Stack

Gemeinsame Schema-/Domain-Tests mit dem im Workspace festgelegten Runner. Angular-Komponenten bekommen gezielte Formular-/Interaktionstests mit dem zur gewählten Angular-Version passenden Test-Setup. Backend-Integration nutzt einen isolierten Testdatensatz. Playwright prüft den durchgängigen Hauptpfad und zwei wesentliche negative Pfade. Asynchrone UI-Zustände werden mit passenden wartenden Assertions geprüft, statt feste Schlafzeiten einzubauen. [Playwright-Referenz](https://playwright.dev/docs/test-assertions).

Ein echter Modell-Smoke-Test und ein begrenzter Live-Rechentest werden bewusst ausgelöst und getrennt von offline laufender CI protokolliert. CI erhält nicht automatisch alle produktiven Provider-Schlüssel. Negative AI-Fälle verwenden feste, klar dokumentierte Erwartungen an erlaubte und verbotene Handlungen.

### 20.4 Wann „fertig“ gilt

Ein Ticket ist fertig, wenn sein prüfbares Ergebnis im integrierten Workspace vorhanden ist, die vereinbarten Invarianten bestehen, relevante Fehlerzustände gezeigt werden und eine zweite Person die Übergabe versteht. Ein Screenshot einer nicht gespeicherten Einzelansicht reicht nicht für ein End-to-End-Ticket.

P0 gilt als abgenommen, wenn fünf Workspace-Ansichten, Zeitbudget, Agentprogress, ein freigegebener grundlegender Voice-Pfad, Kontext-Erklärung, beide Summary-Sichten, Pflichtszenarien, tatsächlicher Modellaufruf, mindestens ein geeigneter Live-Rechenpfad bei verfügbarem Zugang, transparente Fehler-/Replayzustände und der gespeicherte Demo-Vertragsablauf gemeinsam funktionieren. Eine fehlende AI-Ausführung oder ein nur aus Screenshots bestehender Pflichtpfad bleibt ein offener Kernpunkt.

## 21. Messung, NPS und Produktmanagement

P0 protokolliert notwendige technische Kennzahlen lokal bzw. im freigegebenen Backend: Rechen-/Modelllaufzeit, technische Fehlerrate, offene Datenfragen, veraltete Ergebnisse und erfolgreiche Statuswechsel. Eine externe Analyseplattform ist nicht erforderlich.

P1 definiert Events wie `goal_confirmed`, `profile_confirmed`, `scenario_compared`, `human_review_requested`, `recommendation_viewed`, `demo_application_submitted` und `demo_policy_viewed`. Eventdaten enthalten keine Einkommensbeträge, Geburtsdaten, Freitexte oder Gesundheitsinformationen. Fallbezogene Sicherheitslogs und aggregierte Produktmetriken haben getrennte Zwecke und Aufbewahrung.

NPS wird höchstens nach einem sinnvollen abgeschlossenen Beratungsschritt gefragt, nicht nach jeder Bildschirmaktion. Eine freiwillige Bewertung und ein optionaler Kommentar werden nicht mit einem Versicherungsschutz verknüpft. Kommentare erfordern eigene Datenminimierung und Zugriffsbeschränkung.

Für die Produktmanagement-Demo genügen aggregierte synthetische Zahlen: In welchem Schritt treten fehlende Daten auf? Welche Szenarien werden verglichen? Warum wird menschliche Prüfung nötig? Die Demo erfindet keine angeblich echten Kunden-NPS- oder Conversion-Ergebnisse.

## 22. Zusammenarbeit der fünf Personen

### 22.1 Bestätigte Rollen

| Name | Workshop-Bereich | Zuerst liefern | Direkte Übergaben |
|---|---|---|---|
| Luca | UI | Angular-Shell, fünf Tabs, Dynamic View und Agent-Slot | Mit Lukas Darstellung, mit Dario Controls, mit Backend gemeinsamer Fall |
| Lukas | Avatar | Einfacher Agent, Progressring und Zustandsvertrag | Dario meldet Audiozustände, Backend liefert Datenreife |
| Dario | Voice | Zulässiger Speech-Weg, Aufnahme/Transkript, TTS und Stop | Earnie für Advisor-Turn, Lukas für echte Listening-/Speaking-Events |
| Valentin | Logik-Backend | Fachvertrag, Logismata, Budget/Szenarien und GraphContext | Luca für Grafikdaten, Earnie für Erklärung/Summary/Regeln |
| Earnie | KI-Backend | Modellroute, Rückfragen, Fallkontext, Erklärung und Summary | Gemeinsame Session-/Persistenzgrundlage; Valentin für unveränderte Rechenergebnisse |

Es gibt keinen separaten QA-Owner mehr. Jeder prüft seinen Bereich; Integration, Fachfragen und Pitch werden gemeinsam abgenommen. Die ergänzende gemeinsame Backend-Grundlage bei Earnie und fachliche Vertragsstatuslogik bei Valentin sind Umsetzungsvorschläge innerhalb der bestätigten Bereiche, nicht weitere aus dem Foto behauptete Entscheidungen.

### 22.2 Schnittstellen zuerst

Der Ablauf aus dem zweiten Foto und die [Schnittstellen I01–I10](interface-contracts.md) sind die gemeinsame Übergabegrundlage. Dario verantwortet VoiceLog und Playback, Earnie den Advisor-/Fallstand, Valentin AnalysisRequest/Result, Luca Darstellung/Auswahl und Lukas den Renderer. Ein gemeinsamer Vertrag umfasst `CaseSnapshot`, `GraphContext`, `InteractionPreference`, `AgentPresentation`, `VoiceTurn` und `SummaryBundle`. Das ist ein Fallmodell mit mehreren Sichten, kein Datensatz pro Tab oder pro Backend-Owner.

Valentin/Earnie legen Geld-/Zeit-/Versionssemantik fest. Luca/Lukas verbinden Workspace und Agent zunächst mit derselben Fixture. Dario liefert zuerst einen unabhängigen Speech-Smoke und danach denselben Text-/Advisor-Turn. Ein fertiggestellter Text allein löst keine Speaking-Animation aus. Aufnahme-/Abbruchereignisse sind an einen gültigen Turn gebunden.

### 22.3 Integration und Review

Kleine passende Branches/Conventional Commits; Quellen unverändert lassen; keine Schlüssel in Git. Schemaänderungen mit den betroffenen Ownern besprechen. Luca/Earnie prüfen Tab-/Fallkonsistenz, Lukas/Dario Agent-/Audiozustände, Valentin/Earnie Zahlen-/Erklärungsbezug. Jede Rolle liefert ihre negativen Fälle, alle fünf den Hauptdurchlauf.

Die alten 36 Tickets werden nicht als erledigt erklärt. Der [neue Backlog](implementation-backlog.md) und seine JSON-Zuordnung zeigen, wohin jede alte Aufgabe in Workshop-Version 2.0 übergeht. Gleiche alte/neue AI-ID kann einen veränderten Zuschnitt haben; die Version gehört zur Referenz.

### 22.4 Neu geschätzte Kapazität

37 Tickets insgesamt: **34 P0, 2 P1, 1 P2**. P0-Ticketzeit: Luca 15 h, Lukas 9 h, Dario 13 h, Valentin 16 h, Earnie 18 h – **71 Personenstunden**. Hinzu kommen **20 gemeinsame Integrations-/Abstimmungsstunden** und **19 Pufferstunden**, zusammen der frühere grobe Rahmen von **110 Personenstunden**. Optionale Video-/Follow-up-/Dark-Mode-Tickets sind darin nicht als Pflichtarbeit eingerechnet.

Die Stunden sind eine neue Planabschätzung, keine bestätigte Workshop-Zusage. Die bisher generische QA-Spur wird in Owner-Tests und gemeinsame Integration überführt. Earnies Backend-Spur ist der Engpass; Paket-/Modellzugang sowie Persistenz-/Fachvertragsgrenzen müssen zuerst stehen. Lukas/Dario arbeiten unabhängig daran, danach werden nur die gemeinsam festgelegten Events verbunden.

## 23. Integration nach dem Workshop und Zeitgrenzen

Das bisherige 48-Stunden-Fenster beschreibt die gesamte Veranstaltung. Der Workshop startet die Uhr nicht neu. Tatsächliche Restzeit und außerhalb dieses Repos erledigte Umsetzung sind nicht bekannt. Beim nächsten gemeinsamen Start werden die folgenden Tore mit der echten Abgabezeit abgeglichen; alle Tickets bleiben bis zu einem Funktionsnachweis geplant.

| Gate | Gemeinsamer Nachweis | Schwerpunkt der fünf Spuren |
|---|---|---|
| M0 | Fünf Tabs, Agentvertrag, GraphContext, Speech-/Modell-/Paketweg klar | Luca Shell; Lukas Agent; Dario Berechtigungen/Speech; Valentin Fachvertrag; Earnie Backend/Modell |
| M1 | Ein gespeicherter Fall mit Feldvorschlag, Baseline und Fortschritt | Text oder bestätigtes Transkript erreicht dieselbe Fallversion; Ring zeigt echten Datenstand |
| M2 | Alle Ansichten, einfacher Agent, grundlegende Voice und Grafik verbunden | Kein Tabwechsel verliert Kontext; keine Scheinstimme ohne tatsächliche Audioausgabe |
| M3 | Drei Szenarien plus Erklärung einer ausgewählten Stelle | Rechenlauf, Periode, Kennzahl, Text und gegebenenfalls Ton passen zusammen |
| M4 | Summary für Kunde/Fachperson und Demo-Journey | Ein Snapshot, kein automatischer Versand, klare Demo-Antrags-/Policenstatus |
| M5 | Frische Sitzung, negative Fälle und wiederholbare Demo | Rollen, Audio-/Agentfehler, Daten-/Versionsbezug, Replays und Sicherheitsgrenzen geprüft |

Vorläufige Orientierung im ursprünglichen Gesamtfenster: M0 früh in den ersten zwei Stunden, M1 etwa bis Stunde 8, M2 etwa bis 16, M3 etwa bis 24, M4 bis 38, M5 vor den letzten Demo-Proben. Ist dieses Fenster teilweise verstrichen, werden reale Zielzeiten neu vereinbart, nicht zusätzliche 48 Stunden versprochen. Pausen und Schlaf bleiben Bestandteil realistischer Planung.

### 23.1 Kritischer Pfad und parallele Arbeit

```mermaid
flowchart LR
  C[Gemeinsamer Fall und Fachvertrag] --> G[Dynamic View und Rechenlauf]
  G --> X[Gepruefter GraphContext]
  X --> E[Erklaerung und Summary]
  E --> J[Demo-Journey und Portal]
  A[Einfacher Agent mit Progress] --> I[Gemeinsamer Integrationstest]
  V[Freigegebene Voice mit Turn-Vertrag] --> I
  J --> I
  E --> I
```

Lukas und Dario warten nicht auf vollständige Produktregeln oder alle Szenarien. Sie arbeiten mit einem vereinbarten Stub-Kontext und hängen sich danach an echte Ereignisse. Ein Stub bleibt beim abschließenden Funktionsnachweis nicht als reale Voice-/AI-Ausführung stehen.

### 23.2 Kürzungs- und Fehlerregeln

| Problem | Reaktion | Nicht als Lösung akzeptiert |
|---|---|---|
| Pax UI nicht erreichbar | Angular mit kleinem Marken-Fallback; Paketfrage offen dokumentieren | Unberechtigte Registry-Zugriffe oder kompletter Stackwechsel |
| Speech nicht freigegeben/kompatibel | Text läuft weiter; Dario grenzt konkreten Browser-/Providerpfad ein | Stiller Remote-STT-/TTS-Fallback oder bloßer Mikrofonbutton als fertige Voice |
| Video-Avatar braucht zu viel Zeit | P1 streichen, einfacher Agent/Progress bleibt | Grundberatung wartet auf Videodienst |
| Modell nicht nutzbar | Frühe Umgebungsentscheidung; transparenter Fallback, echter AI-Punkt bleibt offen | Vorgefertigte Antworten als Modellbeweis |
| Rechenbackend nicht verfügbar | Passender Replay bzw. begrenztes illustratives Modell mit offenen Fachfolgen | Neue Eingaben mit beliebigen alten Werten kombinieren |
| Zeit knapp | Video-Avatar, Follow-up-Erweiterung, Dark Mode, zusätzliche Produkte/OCR/PDF zuerst kürzen | Fünf Ansichten, grundlegenden Agent-/Voice-Zuschnitt oder Pflichtszenarien still als „nice“ umetikettieren |
| Summary oder Audio widerspricht Grafik | Gemeinsamen Snapshot/Turn korrigieren, betroffenen Übergang stoppen | Drei unabhängig generierte Zahlenstände nebeneinander präsentieren |
| Keine Sales-API | Eigener gespeicherter Demo-Adapter, mit Pax abgestimmt | Reale Quicksale-Bedienung als angebliche unterstützte API |

## 24. Früh an Cem und Claude gerichtete Fragen

Die Challenge nennt Freitag und Sonntag als Expertentermine. Konkrete Uhrzeiten wurden nicht bestätigt. Die Fragen werden vorbereitet; dieser Plan versendet keine Nachricht.

### Erste verfügbare Runde: blockierende Fragen

1. Ist unser abgegrenzter Demo-Adapter für Offerte → Antrag → Prüfung → Demo-Police als PoC-Nachweis akzeptiert? Welche echte Sandbox-Übergabe wäre alternativ unterstützt?
2. Welche Angular-/Pax-UI-Paketversion und welche Registry-/Assetrechte erhält das Team?
3. Welche konkrete Modellumgebung und welche Datenverarbeitung sind freigegeben? Was darf mit ausschließlich synthetischen Daten nach außen gehen?
4. Bedeutet Risiko-`ErrorCode=0` tatsächlich einen auswertbaren Fall? Welche fachliche Normalisierung ist vorgesehen?
5. Wie sind Bedarf, Netto, Steuern, Partnereinkommen und PK-Schätzwerte in den genutzten Operationen genau definiert?
6. Welche zusätzlichen Informationen braucht eine Pensums-/Frühpensionierungsberechnung, damit PK-/AHV-Folgen korrekt sind?

### Zweite Runde: Review des laufenden Prototyps

7. Wodurch entstehen im öffentlichen Referenzfall die kleinen Risikolücken bei gleichzeitiger Nullabsicherung in der Lösung? Gibt es eine dokumentierte Mindest- oder Darstellungsregel?
8. Weshalb trägt der öffentliche Export den Status Entwurf/unvollständige Eingaben? Welche Reifegrade sollte unser PoC unterscheiden?
9. Welche Produktregeln und Dokumentstände sind für die drei gewählten Familien verbindlich? Welche dürfen als reine Vorprüfung abgebildet werden?
10. Welche Daten-/Ereignisregeln gelten für Kinderleistungen, Arbeitgeber-/Taggeld-/UVG-Phasen und die individuelle Angemessenheit?
11. Welche freigegebene Eigenheimlogik darf im PoC verwendet werden, insbesondere bei gebundenen Vorsorgemitteln?
12. An welcher Stelle muss zwingend menschliche Prüfung einsetzen, und wer darf sie in einer realen Integration abschließen?

Jede Antwort wird mit Datum, Gesprächspartner, betroffener Entscheidung und benötigter Änderung in einem kurzen Entscheidungslog festgehalten. Keine nachträgliche Darstellung unbestätigter Annahmen als Expertenfreigabe.

## 25. Demo, Pitch und nachvollziehbarer Funktionsnachweis

### 25.1 Drei Minuten mit einem gespeicherten Fall

| Zeit | Aktion | Sichtbarer Nachweis |
|---|---|---|
| 0:00–0:20 | Agent fragt Zeitbudget, Familie/Ziele öffnen | Kurzmodus und echter Aufnahmefortschritt; keine vorgezogene Produktempfehlung |
| 0:20–0:50 | Eine neue gesprochene oder textliche Pensumsangabe bestätigen | Transkript/Patch, Fallversion und neue Berechnung hängen zusammen |
| 0:50–1:20 | Dynamic View: Familie und Eigenheim vergleichen | Budget/Kapital ändern sich, Unsicherheiten und Quellen bleiben sichtbar |
| 1:20–1:45 | Pensionierungsphase wählen: „Diese Stelle erklären“ | Derselbe GraphContext in Chat/Info und freigegebener Sprachausgabe; Agentstatus stimmt |
| 1:45–2:10 | Handlungsoption und passende Produktfamilie ansehen | Bedarf, Tragbarkeit, Alternative, persönliche Prüfung |
| 2:10–2:40 | Summary-Sichten und Demo-Antrag/Review zeigen | Ein Snapshot und gespeicherte Übergänge; Export sendet nichts automatisch |
| 2:40–3:00 | Demo-Police/Portal und offene nächste Schritte | Wiederaufnahme ohne Dateneingabe; Follow-up-Erweiterung/Video ehrlich optional |

Wenn Voice technisch offen bleibt, wird das nicht versteckt: Der Textpfad zeigt die funktionierende Beratung, während der offene Sprachpunkt genannt wird. Ein echter neuer Modellaufruf und mindestens eine neue berechnete Änderung bleiben Bestandteil des Nachweises. Der Video-Avatar ist kein Ersatz für sie.

### 25.2 Vor dem Pitch prüfen

App aus dokumentierten Startschritten neu starten; eigene Sitzung verwenden; Modell-/Providerstatus prüfen; drei Szenarien öffnen; mindestens einen neuen Wert rechnen; Demo-Journey neu durchlaufen; Browser neu laden; Dossierzugriff testen. Keine echten Schlüssel oder persönliche Terminalausgaben auf der Projektionsfläche zeigen.

Der vorbereitete Screenshot-/Videonachweis ist Backupmaterial und kein Ersatz für den arbeitenden Prototyp. Bei Netzausfall wird offen gezeigt, welcher Teil lokal funktioniert und welcher Stand aus einem gespeicherten Run stammt.

### 25.3 Aussage an die Jury

„Pax besitzt bereits eine digitale Analyse. LifeMap ergänzt eine gemeinsame, veränderbare Lebensplanung: Die Kundin versteht, welche Entscheidung welche Versorgungslücke verändert, kann Annahmen prüfen und führt denselben Fall nachvollziehbar bis zum Demo-Vertragsprozess weiter.“

Keine Behauptung über vollständige regulatorische Freigabe, reale Policenausstellung, garantierte Renditen oder fachliche Identität mit dem vlot-Rechner. Ein transparenter Prüfpfad ist Teil des Produkts und keine Ausrede außerhalb der Demo.

## 26. Von der Hackathon-Demo zum gemeinsam entwickelten PoC

### Phase A – unmittelbar nach Auswahl, vor echten Kunden

Mit Pax Erfolgskriterien, zulässige Daten, Verantwortlichkeiten, Modell-/Hostingumgebung und tatsächliche Schnittstellen festlegen. Eine formale Produkt-/Fachprüfung bewertet die verwendeten Regeln und Beispielrechnungen. Bestehende vlot-/Pax-Systeme werden über dokumentierte Kooperationen berücksichtigt, nicht über kopierte Frontends.

### Phase B – belastbare Integrationen

Demo-Adapter schrittweise durch freigegebene Quote-/Antrags-/Statusadapter ersetzen. Vertragliche Informationen, Dokumentversionen, Identifizierung, gegebenenfalls Geldwäschereiprüfung, Gesundheitsprozess und Signatur mit Pax integrieren. Ein Rückmeldeweg muss auch Nachforderung, Ablehnung und abgelaufene Offerte abbilden.

### Phase C – kontrollierter Nutzertest

Mit genehmigtem Testdesign Verständnis, Korrekturaufwand, offene Daten, sachlich passende Handlungsoptionen und Übergabequalität messen. Abschlussquote ist nicht das einzige Ziel. Erklärungen und Unsicherheiten werden darauf geprüft, ob Menschen sie tatsächlich verstehen. Sprache und Zugänglichkeit werden mitbetrachtet.

### Phase D – produktive Freigaben

Datenschutz-/Sicherheitsprüfung, Berechtigungsmodell, Aufbewahrung, Monitoring, Modelländerungsprozess, versionierte Fachfreigaben und rechtlich freigegebene Vertragsstrecke. Erst danach ist von einem Betrieb mit echten Kundendaten oder echten Versicherungsentscheidungen zu sprechen.

Diese Phasen sind eine Reihenfolge der Nachweise, keine zugesagte Termin- oder Budgetplanung mit Pax. Preisgeld und mögliche Weiterentwicklung sind keine verifizierte Finanzierung des Produktbetriebs.

## 27. Die nächsten 90 Minuten nach Übernahme des Workshops

| Fenster | Gemeinsame Handlung | Ergebnis |
|---|---|---|
| 0–15 min | Echte Restzeit, fünf bestätigte Owner, P0/Video-P1 und Datenwege abgleichen | Kein neues 48-Stunden-Versprechen; klarer erster Integrationstermin |
| 15–35 min | Luca: fünf Tabs; Lukas: Agent/Progress; Dario: Speech-Smoke; Valentin: GraphContext/Fachschema; Earnie: geschützter Fall/Modell | Unabhängige Zwischenstände auf einem gemeinsamen Vertrag |
| 35–55 min | AgentPresentation, VoiceTurn, GraphContext, InteractionPreference und SummaryBundle gemeinsam prüfen | Eindeutige Events, Versionen und Empfänger statt späterer Adapterkollision |
| 55–75 min | Text-/Sprachvorschlag bestätigen, einen Rechenlauf und Fortschritt anzeigen | Erster gemeinsamer Mini-Durchlauf |
| 75–90 min | Grafikstelle auswählen, Erklärung anzeigen, beide Summary-Sichten vergleichen | Konkreter Integrationsfehler oder sichtbarer Erfolg, keine fünf getrennten Inseln |

Dieser Planungsschritt hat keine App installiert, keinen Sprach-/Videodienst aktiviert, kein Audio aufgenommen und keine Nachricht an Fachpersonen versendet. UI- und Feature-Entscheidungen sind dokumentiert; Implementierung erfordert weiterhin einen Funktionsnachweis.

## 28. Quellen und Verbindlichkeit

### Lokale Primärgrundlage

- [Workflow und Schnittstellen aus dem zweiten Foto](interface-contracts.md) sowie [synthetische Vertragsbeispiele](../catalog/interface-contracts.json).

- [Workshop-Entscheide aus dem Foto und Nutzerbestätigung](workshop-decisions.md) und [maschineller Nachweis](../catalog/workshop.json).

- [Challenge-Unterlagen](../../challenge_material/) und [vollständiger Quellenkatalog](../references/README.md).
- [Bisheriger Recherche-/Produktplan](advisor-plan.md) mit konkreten PDF-Befunden und Quellenständen.
- [Öffentlicher Pax/vlot-Test](../reports/public-pension-analysis.md), [Testeingaben](../references/public-pension-analysis/inputs/fictitious-family.json) und [Testprotokoll](../catalog/public-pension-analysis.json).
- [OpenAPI](../references/api/openapi/APICalc.yaml), [Schemaindex](../references/api/openapi/schema-index.json) und [24 technische Beispielpaare](../references/api/examples/).
- [Pax UI: Installation](../references/web/design/components/pax-ui-installation.txt), [Getting Started](../references/web/design/components/pax-ui-getting-started.txt), [Design-Tokens](../references/web/design/components/pax-ui-design-tokens.txt) und [Markenfarben](../references/web/design/brand/pax-brand-farben.txt).

### Ergänzend geprüfte offizielle technische Hinweise

[Angular-Versionen](https://angular.dev/reference/versions), [Reactive Forms](https://angular.dev/guide/forms/reactive-forms), [Signals](https://angular.dev/guide/signals), [Route Guards](https://angular.dev/guide/routing/route-guards), [NestJS-Validierung](https://docs.nestjs.com/techniques/validation), [PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) und [Playwright Assertions](https://playwright.dev/docs/test-assertions). Diese Seiten stützen die jeweils verlinkten technischen Entwurfsentscheidungen. Sie sind keine Bestätigung der noch nicht implementierten App.

Für Voice zusätzlich geprüft: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) und [lokale/remote Speech-Stimmen](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService). Die konkrete Providerwahl wird nicht als Workshop-Entscheidung ausgegeben.

### Datenschutzbezogene Orientierung

[EDÖB: KI und Datenschutz](https://www.edoeb.admin.ch/de/ki-und-datenschutz) und [EDÖB: Informationspflicht](https://www.edoeb.admin.ch/de/informationspflicht). Die konkreten Produkt-/Vertrags- und Betriebsfreigaben bleiben mit Pax abzustimmen. Der vorliegende Plan erfindet keine verbindliche Rechtsauslegung oder nicht belegte Tarif-/Leistungsregeln.

### Noch offene Entscheidungen

Exakte Voice-/Videoanbieter und Demo-Browser, „Candidate“-Benennung und tatsächlicher Übergabekanal, Follow-up-/Dark-Mode-Priorität, konkrete Grafiklegende, echte Restzeit; exakte Pax-Paket-/Angular-Version und Paketberechtigung; freigegebene Modellumgebung; tatsächliche Sales-/Portal-Schnittstellen; Risiko-Code-Interpretation; vollständige Zeit-/Kinder-/PK-Logik; Eigenheimkriterien; verbindliche Produktstände; persönliche Angemessenheitsstrecke und reale Review-Rollen. Alle sind im Plan mit dem betroffenen Verhalten und einem frühen Klärungspunkt verbunden.
