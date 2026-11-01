# Lebensversicherungs-Backend – Requirements und Nachweise

Stand: 31.10.2026 · bestätigter Umfang: Valentins gesamter Logik-Backend-Teil. Der Nutzer hat die Abgrenzung ausdrücklich bestätigt. Angular = Luca, Avatar = Lukas, Voice = Dario, KI-Dialog = Earnie. Diese Team-Komponenten werden durch dieses Backend unterstützt; ihre Fertigstellung wird hier nicht behauptet.

**Prüfstand (31.10.2026):** 121 automatisierte Tests bestanden, 0 fehlgeschlagen (heute über 500 Backend- und über 500 Web-Tests, siehe [Architektur](../../architecture.md#tests)); echter HTTP-End-to-End-Test mit allen 24 implementierten Logismata-Operationen und ausschließlich erfundenen Daten bestanden. Vier echte Variantenläufe, drei gespeicherte Vergleiche, lokale Demo-Police, übereinstimmende Summary-Snapshots und Portal nach Server-Neustart geprüft. Der [bereinigte Live-Nachweis](life-insurance-live-verification.json) enthält Zeitpunkt, Operations-/Szenariostatus und tatsächlich durchlaufene Schritte. Reviewer-Handlungen wurden im Test durch eine eigene Testrolle simuliert, nicht durch einen Pax-Fachexperten genehmigt.

„Implementiert“ bezeichnet die funktionierende Backend-Funktion im synthetischen PoC. „Team-Integration offen“ bedeutet Anschluss an die anderen vier Arbeitsbereiche. „Release-Gate“ bezeichnet eine bewusst gesperrte echte Geschäfts-/Produktionsfunktion. Das ist keine pauschale Bestätigung von Rechtskonformität oder Versicherungsdeckung.

## Challenge-Anforderungen im bestätigten Backend-Umfang

| ID | Anforderung | Implementierung und beobachtbares Ergebnis | Nachweis / Grenze |
|---|---|---|---|
| B01 | Leben und Ziele vor Produkten | Pflichtaufnahme von Zielen, finanzieller Gesamtsituation, Partnerschaft, Kindern, Schulden, bestehender Vorsorge und persönlichem Spielraum; keine persönliche Empfehlung vor bestätigtem vollständigem Bedarf | `intakeQuestions`, Bestätigungsgate; Tests für fehlende Ziele, unbekannte Werte und gesperrte Empfehlung |
| B02 | Finanzielle Ausgangslage | Einkommen mit Netto-/Steuerbasis, verschachtelte Ausgaben, Schuldenservice, Reserve, Vermögenszuordnung, private Beiträge und personenbezogene Finanzierbarkeit | Domain-/Journey-Tests; Fehler statt Schattenrechnung bei fehlender Grundlage |
| B03 | Drei Säulen verknüpfen | Getrennte Leistungen und Kapitalreferenzen für Staat, PK und private Vorsorge je Person/Ereignis; keine Vermischung von Rente und Kapital | `pillarPicture`, Budget/Kapital und Quellen; Ausgabeschema validiert alle drei Säulen |
| B04 | Lebensversicherung aus Bedarf | EU durch Krankheit/Unfall und Tod durch Krankheit/Unfall getrennt; deklarierter Zielbedarf, Partnerlohn, bestehende private Risiko-Renten, endliche Kapitalisierung, bestehendes Todesfallkapital, Schulden und Liquiditätsstrategie | `deriveRiskNeeds`, `deathCapitalNeed`; Tests für vorhandene Mittel, Provider-Zielbegrenzung und Doppelzählung |
| B05 | Familie simulieren | Bestätigter Pensumswechsel und Betreuungskosten; neue Cashflows/Bedarfe am selben bestätigten Profil; PK-Werte bleiben als überprüfungsbedürftige Ausgangswerte erhalten | Echte Variante `family`; gespeicherter Vergleich zur Baseline |
| B06 | Eigenheim simulieren | Kaufquote, Kosten, Reserve, Zins, Unterhalt und Amortisation; verfügbare freie Mittel und offen bleibende Finanzierungslücke | Echte Variante `home`; Kapital-Ledger, keine stillschweigende 3a-Verfügbarkeit/Kreditzusage |
| B07 | Pensionierung simulieren | Getrennte Erwerbs-/Rentenzeitpunkte beider Personen, Überbrückung, nominale Monatsserie, gebundene Sparmittel, explizite Kapitalfreigabe und Kapitalerschöpfung | Echte Variante `retirement`, vier Phasengrenzen; Tests für fehlende Werte und Kapital-/Renten-Doppelzählung |
| B08 | Szenarien vergleichen | Gespeicherte unveränderte Ausgangsläufe, Server-Differenzen mit Run-/Profil-/Hashbindung; keine Differenz bei ungeeigneten Datenqualitäten oder gemischten Einheiten | `ScenarioComparisonService`; drei echte Vergleiche; geänderter Entwurf macht Vergleiche veraltet |
| B09 | Passende Pax-Lösung als zweiter Schritt | Regelbasierte Kandidaten aus tatsächlichem Risiko-/Sparbedarf, nachvollziehbare Regelversion und Quellen; alternative Sparprodukte werden nicht gestapelt; „kein neuer Vertrag“ bleibt eine Option | `products.ts`; Tests für Rest-3a-Grenze, persönliche Mittel und Verzicht auf Todesfallschutz bei ausreichender gewählter Eigenfinanzierung |
| B10 | Empfehlungen erklären und dokumentieren | Regel-ID/-Version, Gründe, Eingabehash, Modell, Lauf, Produktquellen, offene Bedingungen und Datenstatus werden gespeichert | Empfehlung, beide Dossiers und Audit; Wortlaut/LLM-Erklärung bleibt Earnies Aufgabe |
| B11 | Intelligente Rückfragen | Konkrete fehlende Pflichtfelder, drei oder eine Frage nach Zeitbudget; DE/FR/IT/EN; unbekannte Werte werden nie automatisch null Franken | `/questions`, `/advisor/context`; Tests für französische Zielrückfrage, unbekannten Bedarf und fehlende Unterhaltsdauer |
| B12 | Menschliche Prüfung | Gespeicherte Aufgabe, offene Gründe, separate Reviewer-Rolle und fünf Kriterien; neue Prüfung entzieht Freigabe; Rückfragen/Abbruch möglich | Rollen-/Review-Tests, E2E-Demo-Gate; Testfreigabe verändert ursprünglichen Risiko-Code-0-Status nicht |
| B13 | Beratung → Empfehlung → Vertrag → Portal | Persistierte Demo-Konfiguration, Dokumentbestätigung, Antrag, Einreichung, Prüfung, Annahme, Demo-Police und Portal als getrennte Zustände | HTTP-/Domain-E2E; Idempotenz und Neustart geprüft; echte Pax-Vertrags-APIs sind Release-Gate |
| B14 | Dokumente und Summary | Feste PDF-Allowlist, SHA-256-Bindung, Aktualitätsvorbehalt; zwei Summary-Sichten desselben Snapshots, JSON und druckbares escaped HTML | Dokumentdownload per HTTP, gleiche Snapshot-ID, Rollen-/Besitzprüfung; kein automatischer Versand |
| B15 | Funktionierender Prototyp | Lokal startbare NestJS-Anwendung, echte Rechner, vollständige HTTP-Schnittstellen, OpenAPI und gemeinsame Laufzeitschemas | `npm start`, `npm test`, `npm run test:live`; Team-UI/Voice/Avatar separat anzubinden |
| B16 | Transparente Datennutzung vorab | Öffentlicher Hinweis, Hinweisversion und ausdrückliche synthetische Rechnerfreigabe vor Bestätigung/Schätzaufrufen | `/privacy`, strikte Klassifikation; Produktionsverantwortliche/Empfängerländer/Freigaben offen |
| B17 | Kein unkontrolliertes AI-/Cloud-Senden | Keine Modellaufrufe aus diesem Backend; fester autorisierter Rechnerhost; minimierter Agentkontext enthält keine Übertragungserlaubnis | API-Allowlist, kein dynamischer Zielhost, `noExternalAiTransferAuthorized` |
| B18 | Sicher von Beginn an | Besitzer-/Rollenprüfung, CSRF bei Cookies, Login-/Schreibbegrenzung, Session-Ablauf, AEAD-Speicher, Dateirechte, technische Audit-Einträge, Falllöschung | Negativtests einschließlich Fremdfall/PDF, Rollenfälschung, manipulierter Verschlüsselung und SSE-Widerruf |
| B19 | Versicherungsrecht, Form, AML, Underwriting | Echte Verarbeitung/Annahme gesperrt; fehlende echten Signatur-/Identitäts-/Tarif-/AML-APIs werden nicht simuliert als Geschäftswahrheit ausgegeben | Ausschließlich Demo-Flags, Prämie `null`, keine echte Deckung; rechtliche Fachfreigabe ist Release-Gate |
| B20 | Mehrsprachigkeit | 191 zentrale Schlüssel DE/FR/IT/EN; wechselbare Locale, Rückfragen, Empfehlungen/Begründungen, Produktbeschreibungen, Status/Disclaimer, Fehler, Datenschutzanzeige und zwei Dossier-Sichten übersetzt | Vier HTTP-Sprachtests und vier Live-Export-/Empfehlungsprüfungen; Finanzhash bleibt stabil. Angular-/Dialog-/Voice-Anschluss bei den zuständigen Teammitgliedern; rechtliche Original-PDFs ausdrücklich als Deutsch gekennzeichnet |
| B21 | Voice und Avatar | Fallgebundene Kontextabfrage, SSE-Versionen, Vorschläge/Bestätigung, Grafikfakten und Datenaufnahme-Fortschritt | Backend-Anschluss implementiert; STT/TTS, Turn-/Audioabbruch und Avatar-Ring sind Dario/Lukas/Earnies Integration |
| B22 | Zukunftssimulation | Frei parametrisierbare bestätigte Familien-/Haus-/Ruhestandsvarianten statt statischer Produktführung | Drei Szenariotypen im selben gespeicherten Fall; weitergehende Steuer-/PK-Sonderfälle bleiben sichtbar prüfpflichtig |
| B23 | NPS und Drop-off-Insights | Nicht umgesetzt: NPS-Umfrage und Insights-Ansicht wurden am 01.11.2026 entfernt | — |

## LOG-01 bis LOG-07 gegen die Workshop-Abnahme

| Ticket / Abnahmekriterium | Backend-Nachweis | Status |
|---|---|---|
| LOG-01: Unbekannt, Schätzung, Bestätigung, Review getrennt | Zod-Feldschema, bestätigte unveränderliche Profile, Providerstatus und eigenständige ReviewTasks | Implementiert, automatisiert geprüft |
| LOG-01: GraphContext trägt Run, Profil, Szenario, Person, Kennzahl, Periode | Fall-/Hash-/Versionsprüfung und exakte Grafikfakten; veraltete Kontexte gesperrt | Implementiert, automatisiert geprüft |
| LOG-01: Fortschritt nach Pflichtgruppen | `progress.scope=whole_life_intake`, getrenntes `reviewOpen` | Implementiert; Ring-Darstellung bei Lukas |
| LOG-02: Token serverseitig, Orte/Einheiten/Bedarf validiert | Geschützter Umgebungszugang, Ortslookup und CHF-/Rappen-Grenze | 24 Operationen echt geprüft |
| LOG-02: Risiko-Code 0 bleibt prüfpflichtig | Tatsächliche Live-Antworten werden `requires_review`, keine Umdeutung durch Test-Reviewer | Implementiert; Pax-/Logismata-Erklärung offen |
| LOG-02: Begrenzte Fehlerpfade und exakter Replay | Zeit-/Größen-/Parallelitätsgrenzen, kein Fehler-Fallback, Hash-Miss statt falscher Archivantwort | Implementiert, automatisiert geprüft |
| LOG-03: Netto/Brutto, Perioden und Beiträge | Reine Budgetfunktionen, Basenvalidierung, keine Addition enthaltener Positionen | Implementiert, automatisiert geprüft |
| LOG-03: Fehlender Bedarf ist keine Nulllücke | Pflichtfragen, `null`-Weitergabe und gesperrte Empfehlung | Implementiert, automatisiert geprüft |
| LOG-03: Keine mehrfache Kapitalzuordnung | Asset-Ledger, Zweckzuordnung und Ablehnung von Überbelegung | Implementiert, automatisiert geprüft |
| LOG-04: Pensum ändert Cashflow, PK nicht pauschal | Bestätigte lineare Lohnannahme; eigener PK-Prüfgrund | Implementiert, Live-Familienlauf geprüft |
| LOG-04: Erwerbsende/Rentenbeginn/Brücke getrennt | Je Person konkrete Monatsgrenzen, vier Phasen im Live-Test | Implementiert, automatisiert und live geprüft |
| LOG-04: Kapitalerschöpfung/Fachgrenzen sichtbar | Erste ungedeckte Entnahme, gebundener Spar-Topf, Daten-/Freigabevorbehalte | Implementiert, automatisiert geprüft |
| LOG-05: Annahmen statt Kreditzusage | Explizite Szenarioparameter und Vorbehalt im Ergebnis | Implementiert, Live-Eigenheimlauf geprüft |
| LOG-05: Vorsorgekapital nicht still frei | Verfügbarkeit/Bindung und explizite spätere Freigabe | Implementiert, automatisiert geprüft |
| LOG-05: Lücke/Reserveverzehr sichtbar | Home-Finanzierungskennzahlen, Zuordnungen und gespeicherte Differenz | Implementiert, automatisiert und live geprüft |
| LOG-06: Aktuelle Empfehlung und Review vor Vertrag | Lauf-/Profilbindung, separate Reviewer-Freigabe und ausdrückliche Auswahl | Implementiert, Negativfälle geprüft |
| LOG-06: Antrag/Annahme/Police und Idempotenz | Getrennte gespeicherte Objekte, Command-Fingerprint, kein Duplikatantrag | Implementiert, HTTP und Live-Demo geprüft |
| LOG-06: Keine echte Deckung behauptet | Unveränderliche Demo-/Keine-Deckung-/Keine-Rechtswirkung-Kennzeichnung, keine Prämienerfindung | Implementiert, automatisch geprüft |
| LOG-07: Quellen nicht ungeprüft gleichsetzen | Run-/Modell-/Request-Hash, Original-Provenienz und Archivstand, kein vlot-Wertetransfer | Implementiert; fachliche Vergleichbarkeit gesondert zu prüfen |
| LOG-07: Kleine Lücken/Schätzung/Entwurf erklärbar | Erfasster Bedarf bleibt maßgeblich; Herkunft und Status in Risikoausgabe/Empfehlung/Export | Implementiert, automatisiert geprüft |
| LOG-07: Vorbehalte über alle Kanäle gleich | Gemeinsamer Dossier-Snapshot, Agentkontext und getrennte originale Datenqualität | Backend geprüft; Darstellung/gesprochene Freigabe gemeinsam abnehmen |

Die sieben LOG-Tickets stehen auf **implementiert, Backend-Prüfung bestanden; Team-/Fachabnahme ausstehend**. Eine zweite Person bzw. der Sponsor muss die vereinbarte gemeinsame Abnahme tatsächlich durchführen. Offene Produktionsfreigaben werden nicht durch das Umsetzen eines Tickets ersetzt.

## Workshop-Schnittstellen

| Interface | Backend-Anteil | Gegenstelle |
|---|---|---|
| I01 VoiceLog | Nimmt keinen ungeprüften Sprachtext als bestätigtes Finanzprofil an; nur strukturierte Vorschläge | Dario → Earnie implementieren Transkript-/Turn-Vertrag |
| I02 gemeinsamer JSON-Fall | Geschützter Fallstore, Entwurf, CAS-Revision, bestätigte Versionen, Vorschläge | Earnie nutzt denselben Fallservice |
| I03 bestätigter Recheninput | Validierte Laufzeitschemas, servergesetzte IDs/Version, explizite Szenarien | Earnie/Luca lösen berechtigten Rechenauftrag aus |
| I04 Result | Validierter `LifeAnalysis` mit lokalem Result, echten Providerdaten, Risiken, Phasen, Quellen und Status | Luca rendert ohne eigene Fachrechnung |
| I05 AgentReply | Liefert freigegebene aktuelle Fakten und zulässige Grafik-/Vergleichsdaten | Earnie erzeugt Antwort mit denselben Referenzen |
| I06 Playback | Finanzstatus bleibt von Audio-/Avatarstatus getrennt | Dario/Lukas implementieren reale Wiedergabeereignisse |
| I07 Grafikbezug | Exakte Auswahlprüfung, Monats-/Bereichsfakten und Hashbindung | Luca setzt Auswahl; Earnie/Dario lesen Kontext neu |
| I08 Summary | Zwei gespeicherte Sichten derselben bestätigten Daten, JSON/Druckansicht und Journeyobjekte | Luca bietet Download; Earnie kann darauf sprachlich aufbauen |
| I09 Fortschritt | Pflichtgruppen-Prozent plus separater Fachreview | Lukas zeigt Ring/Farbe zugänglich am Agenten |
| I10 dynamischer Kontext | SSE-Referenzen, Kontextrevision, Tempo, Fragen, Auswahl und erneute Abfrage vor Antworten | Earnie/Dario invalidieren veraltete Turns und Audio |

## Verbleibende Release-Gates und Fachfragen

1. **Pax/Logismata:** Semantik der beobachteten Risiko-Codes `0`, genaue Leistungs-/Bedarfsfelder und deren Freigabe bestätigen. Bis dahin bleiben die Rohresultate prüfpflichtig.
2. **Pax-Fachperson:** PK-Folgen bei Pensumswechsel/Frühpensionierung, Geburtsmonat/Bezugszeitpunkt, Begünstigung/Partnerschaft/Kinder und 3a-/WEF-/Steuerberechtigung prüfen. Der PoC zeigt Annahmen und prüfpflichtige Grenzen, keine gesetzlichen Einzelzusagen.
3. **Pax-Produkte:** Gültigkeit der archivierten PDFs sowie persönliche Eignung der katalogisierten Produktfamilien bestätigen. Individuelle Prämie, Kosten, Ausschlüsse und konkrete Deckungsbedingungen benötigen echte Tarifierung und Fachreview.
4. **Echte Abschluss-APIs:** Tarifierung, Antrags-/Underwriting-Service, Identität/AML, Signatur, Annahme, Policierung und Kundenportal anbinden. Keine dieser APIs wurde als verfügbar nachgewiesen. Die Demo bleibt technisch gegen echte Deckungsbehauptung gesperrt.
5. **Datenschutz/Produktion:** Verantwortliche/Kontakt, Empfänger/Auslandsübermittlung, Zwecke und Rechtsgrundlagen, Lösch-/Aufbewahrung/Backups, Vertragsformalitäten, Rollen und Sicherheitsfreigabe mit Pax klären. Loopback, lokale Schlüssel und anonyme Demo-Sitzungen ersetzen keine Produktions-IAM-/KMS-/TLS-Architektur.
6. **Team-Abnahme:** Angular-Flow, Dialog, Grafik-/Vergleichsauswahl, Ring, Voice-Unterbrechung und sichere Modellroute gemeinsam mit frischem synthetischem Fall demonstrieren. Nicht konfigurierte Modell-/Sprachanbieter erhalten keine Kundendaten durch dieses Backend.

Relevante externe Primärquellen: [Pax private Vorsorge](https://www.pax.ch/de/private-vorsorge), [Todesfallversicherung](https://www.pax.ch/de/private-vorsorge/produkte/pax-todesfallversicherung), [Erwerbsunfähigkeitsversicherung](https://www.pax.ch/de/private-vorsorge/produkte/pax-erwerbsunfaehigkeitsversicherung), [EDÖB zur Informationspflicht](https://www.edoeb.admin.ch/de/informationspflicht). Implementierte Request-Strukturen stammen aus der archivierten [APICalc-Spezifikation](../../challenge_material/APICalc-swagger.yaml); ihre tatsächliche Ausführung ist separat im Live-Bericht belegt.


## Ergänzung zur Tool-Abdeckung und Übersetzung

Die frühere Auswahl von 16 Operationen war eine fachliche Priorisierung, keine technische API-Grenze. Nun sind alle 24 bereitgestellten Operationen angebunden. Die acht zusätzlichen Werkzeuge umfassen Steuerdatenstand, Geosuche, Grundstückgewinn-Zusatzfelder/-steuer, drei Erbschafts-/Schenkungssteueroperationen und Unternehmenssteuer. Sie sind separat autorisiert, erfordern ausdrückliche synthetische Transferfreigabe und verändern die bestätigte finanzielle Grundlage nicht automatisch. Die vollständige Zuordnung zur Sponsor-Spezifikation wird automatisch geprüft.

Der vorherige Mehrsprachigkeitsstand umfasste nur Locale und einige Rückfragen. Er war keine vollständige Übersetzung des Backends. Diese Lücke ist durch die lokalisierte Präsentationsschicht, das zentrale Vier-Sprachen-Wörterbuch, übersetzte Empfehlungs-/Fehler-/Datenschutzausgaben und den Dossier-Renderer geschlossen. Technische Codes und unveränderte Finanzwerte sind bewusst sprachunabhängig. 121 Tests bestehen; der erweiterte Live-Nachweis umfasst alle 24 Operationen sowie vier Sprach-/Dossierprüfungen mit stabilem finanziellem Eingabehash. Die tatsächliche Angular-/KI-/Voice-Integration bleibt getrennte Teamarbeit, die Übersetzung juristischer Originaldokumente benötigt freigegebene Quellenfassungen.


## Gemeinsamer vollständiger Vertrag

`InsuranceCaseDtoSchema` und alle Fachdaten-Untertypen liegen jetzt im gemeinsamen Paket `@pax/contracts`. Das Backend leitet seine Geschäftsobjekte aus denselben Typen ab und ergänzt ausschliesslich private Persistenz-/Berechtigungsfelder. Die Fallantworten, der minimale Agent-Kontext, die SSE-Daten, Portal und Summary werden vor Ausgabe gegen die gemeinsamen Schemas geprüft. Zehn JSON-Schema-Exporte und browserfähige kompilierte Beispiele unterstützen die anderen Teammodule. 121 Tests bestehen, darunter Querverweis-/Rollen-/Vertrags-/Parallelitätsprüfungen. Der [Team-Leitfaden](../plans/team-api-guide.md) und der [Speicher-/DB-Entscheid](../../architecture.md#datenhaltung) unterscheiden vorhandene Schnittstellen von zukünftiger SQL-/Netzintegration.

## Ergänzung: in der App sichtbar (31.10.2026)

Die Backend-Anforderungen B13, B14, B21 und B23 sind jetzt auch in der Angular-App bedienbar:

- **B13 Beratung → Empfehlung → Vertrag → Portal:** Tab „Abschluss“ (`features/journey`) mit Empfehlung je Produkt und Person, Fachprüfung, Offerte (keine erfundene Prämie), Antrag mit den vier für einen echten Vertrag nötigen Schritten, Einreichung, Fachprüfung und Demo-Police im Kundenportal. Im Demo-Start simuliert `POST /api/cases/{caseId}/demo-review` die Pax-Fachperson über das Demo-Prüfkonto und die normalen Prüfmethoden (Rollen, Revisionen, Audit); die Oberfläche kennzeichnet das. Ausserhalb des Demo-Starts wartet der Fall auf eine echte Prüfung.
- **B14 Dokumente und Summary:** Produktdokumente der Offerte als Download (SHA-256-gebunden) mit Lesebestätigung; Beratungsdossier als druckbares HTML.
- **Eignungsprüfung (Pax-Formular 0054):** Formular für fondsgebundene Produkte vor der Offerte.
- **B21 Avatar:** Lukas' Renderer im Agent-Dock, gesteuert vom Aktivitätsring und dem Pegel der Live-Voice.
- **B23 NPS und Abbruch-Insights:** nicht Teil der Abgabe; NPS-Umfrage und Insights-Ansicht sind entfernt.

Nachweis: `code/tests/contract-journey.test.mjs` (HTTP-End-to-End), Angular-Specs unter `features/journey`, und ein Lauf gegen den Live-Rechner bis zur Demo-Police (Dossier, PDF). Eine Person ohne eigenes Einkommen oder Vermögen erhält für ihre Produkte keine Offerte; die App erklärt das.

