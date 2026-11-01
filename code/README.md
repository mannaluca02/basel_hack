# Pax LifeMap – Lebensversicherungs-Backend

Stand: 31.10.2026 · Valentin · Feature `feature/life-insurance-live-backend` · TypeScript/NestJS/Zod, Node 22.

Das Backend bildet den bestätigten Workshop-Zuschnitt LOG-01–LOG-07 als funktionierenden PoC ab: ein geschützter gemeinsamer JSON-Fall, bedarfsorientierte Aufnahme, drei Säulen, Lebensversicherung, Szenarien, nachgelagerte Pax-Produktfamilien, Fachreview und gespeicherter Demo-Vertragsweg bis ins Portal. Die reguläre Anwendung verwendet echte Logismata-Rechner. Angular, KI-Dialog, Voice und Avatar werden durch Luca, Earnie, Dario und Lukas angebunden.

Die [Requirements-Matrix](../documentation/baselhack/reports/life-insurance-requirements.md) trennt implementierte Backend-Funktionen, automatische Nachweise, Team-Integration und Produktionsfreigaben. Der [Implementierungsbericht](../documentation/baselhack/reports/logic-backend-implementation.md) beschreibt Architektur und fachliche Grenzen.

## Start und Prüfung

Im Verzeichnis `code/`:

```bash
npm ci --ignore-scripts
npm test
npm start
```

`npm start` lädt die gitignorierte Root-`.env` (Vorlage [`.env.example`](../.env.example)) oder die Serverumgebung. Benötigt wird `LOGISMATA_BEARER_TOKEN`; bei fehlendem Token startet der Live-Dienst nicht. Zugangsdaten werden weder geloggt noch ins Angular-Bundle eingebaut.

Der Dienst bindet an `http://127.0.0.1:3000`; `PORT=3001 npm start` ändert den Port. Mit `PAX_VOICE_AGENT=1` läuft im selben Prozess Darios Voice-Agent Paxi auf `http://localhost:3100` (eigene Origin für Seite, Origin-Prüfung und `postMessage`); dafür einmal `npm install` in `code/voice-agent`. Das braucht nur die App-Konfiguration `paxi`: `npm run dev:paxi` startet beides. Sonst spricht die App über die eingebaute Live-Voice. `PAX_VOICE_AGENT_PORT` ändert den Port. Ist der Port belegt oder fehlt die Installation, startet das Backend trotzdem und meldet das. Öffentliche Einstiege sind `/api/privacy`, `/api/status` und `/api/openapi.json`. Alle Fall-, Dokument-, Portal- und Gesprächsdaten benötigen eine Sitzung. Der Start gibt ausschließlich den Pfad der lokalen Zugangscode-Datei aus.

Beim ersten Start entstehen unter `code/.local/lifemap/` ein privates Verzeichnis (0700), getrennte Kunden-/Reviewer-Zugangscodes und ein Schlüssel (0600), verschlüsselte Fall-/Sitzungsdaten sowie eine Prozesssperre. `.local/` ist Git-ignoriert. Der Speicher ist für einen lokalen Node-Prozess ausgelegt. Kein Deployment und keine Freigabe für echte Kundendaten sind eingerichtet.

| Befehl | Wirkung |
|---|---|
| `npm test` | Vollständiger Build und alle Backend-Tests (über 430); Rechner und OpenAI synthetisch ersetzt, kein externer Zugriff |
| `npm run test:all` | Backend, Voice-Agent und Web-App zusammen |
| `npm run test:coverage` | Backend-Tests mit Abdeckung je Datei (Web: `npm --prefix apps/web run test:coverage`, Voice-Agent: `npm --prefix voice-agent run test:coverage`) |
| `npm run test:live` | Echte 24 Rechenoperationen mit ausschließlich erfundenen Daten; Baseline/Familie/Eigenheim/Pensionierung; Demo-Vertragsweg und Portal nach Neustart |
| `npm run test:live:metadata` | Kleiner echter 3a-Metadaten-Smoke mit leerer Anfrage |
| `npm run start:demo` | Frühere, ausdrücklich separate Offline-HTTP-Demo mit festen Fixtures unter `/api/demo/` |
| `npm run demo` | Frühere Offline-Fachdemo ohne HTTP-Server |

Der Live-Test erzeugt eine eigene temporäre verschlüsselte Datenbank und räumt sie anschließend auf. Die Reviewer-Rolle wird dort ausschließlich für den erfundenen Testfall simuliert; das ist keine fachliche Pax-Freigabe. Optional schreibt `LIFEMAP_LIVE_REPORT=/absoluter/pfad/report.json npm run test:live` einen bereinigten Nachweis ohne Token. Der lokale Beispieldatensatz steht in [insurance-household.json](fixtures/insurance-household.json).

## Testabdeckung

Stand 01.11.2026: Backend 96 % der Funktionen und 99 % der Zeilen, Web-App 95 % und 97 %, Voice-Agent 89 % und 87 % (ohne die Browser-Skripte unter `public/`). End-to-End über HTTP laufen: Demo-Start und Live-Voice (`tests/live-voice-journey.test.mjs`), Abschluss bis zur Demo-Police (`contract-journey`), gewählter Grafikpunkt (`graph-context`), jede Route einmal über den echten Controller (`http-routes`) und Darios Paxi-Server (`voice-agent/server.test.mjs`). Ersetzt werden dabei nur Logismata und OpenAI.

## Angular anbinden

Für Lucas Angular-Anwendung wird ein Same-Origin-Proxy empfohlen, beispielsweise `proxy.conf.json`:

```json
{ "/api": { "target": "http://127.0.0.1:3000", "secure": false, "changeOrigin": true } }
```

Dann `ng serve --proxy-config proxy.conf.json` und im Client ausschließlich relative `/api/...`-URLs verwenden. Das vermeidet unterschiedliche Cookie-Sites zwischen `localhost` und `127.0.0.1`. Direkte lokale Origins `http://localhost:4200` und `http://127.0.0.1:4200` sind freigegeben; bei direkten Aufrufen müssen Cookies ausdrücklich mitgesendet werden.

1. Vor Aufnahme `/api/privacy` anzeigen. Im PoC sind ausschließlich erfundene Daten zugelassen.
2. `POST /api/sessions` mit `{ "accessCode": "<lokaler Zugangscode>" }`. Die Rolle wird serverseitig aus dem Code ermittelt. Die Antwort setzt ein HttpOnly-/SameSite-Strict-Cookie und liefert `csrfToken`, `expiresAt` sowie einen Bearer-Token für serverseitige Integration.
3. Im Angular-Client `csrfToken` in `sessionStorage` halten, damit er einen Reload übersteht; bei Cookie-Authentisierung alle schreibenden Aufrufe mit `X-CSRF-Token` senden. Den Sitzungstoken nicht loggen. Die lokalen HTTP-Cookies sind für Loopback ausgelegt; produktive TLS-/Secure-Cookie-/IAM-Konfiguration ist ein gesondertes Release-Gate.
4. `POST /api/cases` mit `{ "locale":"de", "timeBudgetMinutes":10, "noticeVersion":"lifemap-synthetic-v2", "dataClassification":"synthetic" }` erzeugt einen eigenen Fall. Neue Logins erzeugen getrennte anonyme Demo-Besitzer. Bestehende Cookies/Sitzungen können innerhalb ihrer einstündigen Gültigkeit nach Reload und Server-Neustart weiterverwendet werden. Das ersetzt kein Pax-Kundenlogin.
5. `PATCH /api/cases/:id/draft` schreibt `financial`, `insurance`, `goals`, `reviewFlags` und `expectedCaseRevision`. Der vollständige Beispieldatensatz ist die Startvorlage; unbekannte Werte bleiben `null`. Der Server setzt Fall-ID und Profilversion selbst.
6. `/questions` liefert gezielte Pflichtfelder und abhängig vom Zeitbudget eine oder drei nächste Fragen. `/confirmations` benötigt `expectedCaseRevision`, `confirmProfileAndAssumptions:true`, `allowSyntheticCalculatorTransfer:true` und `noticeVersion`. Nur der Kundenkontext bestätigt den unveränderlichen Profilstand.
7. `/calculations` benötigt `expectedCaseRevision`, `expectedProfileVersion`, `scenarioVersionId` und `scenario`. Die Antwort enthält `run` mit lokalen Kennzahlen, Providerergebnissen, Risiko-/Kapitalbedarf, drei Säulen, Prüfgründen und gegebenenfalls Zeitachse.
8. Für Varianten `/comparisons` mit `baselineRunId`, `variantRunId`, `expectedProfileVersion` verwenden. Differenzen werden serverseitig für die Kennzahlen am Bewertungsstichtag berechnet (`scope=valuation_snapshot_local_metrics`, `futureTimelineCompared=false`). Eine unveränderte aktuelle Jahresbilanz bei einem späteren Ruhestand bedeutet keine unveränderte Zukunft; dafür ist die separate Zeitachse maßgeblich.  unpassende Perioden, Datums-/Modellstände und prüfpflichtige Werte werden nicht als verlässliche Differenz ausgegeben. `/active-analysis` wählt einen gespeicherten Lauf ohne neue Providerkosten.
9. `/recommendations` ist erst nach bestätigtem vollständigem Bedarf und verwertbarem aktuellem Lauf verfügbar. Fachprüfung und ausdrückliche Produktauswahl folgen vor dem Demo-Vertragsweg.

Die vollständigen Routen und Eingabeschemas stehen in `/api/openapi.json`. Zod-Verfeinerungen, Personenbezüge und Workflow-Invarianten werden zusätzlich zur OpenAPI-Darstellung zur Laufzeit geprüft. Der gemeinsam importierbare Vertrag liegt in [packages/contracts](packages/contracts/src/index.ts); `LifeAnalysisSchema` validiert auch die komplette serverseitige Ausgabe.

## Aufbau und gemeinsamer Fall

| Modul | Aufgabe |
|---|---|
| `packages/contracts/src/financial.ts` | Geld in CHF-Rappen, Quellen/Bestätigung, finanzieller Snapshot, GraphContext |
| `packages/contracts/src/insurance.ts` | Lebenssituation, Ziele, Schulden, Kinder, Versicherungsbedarf, Szenarien, Review-/Journey-Eingaben |
| `packages/contracts/src/life-analysis.ts` | Validierter kompletter Rechenlauf, Risiko- und Zeitachsen-Ausgaben |
| `packages/domain/src/` | Reine Budget-/Kapital-/Säulen-/Szenario-/Lebensversicherungsfunktionen |
| `apps/api/src/calculation/` | Weiterverwendbarer NestJS-Rechenkern, Hash-/Versionsschutz |
| `apps/api/src/logismata/` | Allowlist, 24 Request-/Response-Mapper, Live und exakter Replay |
| `apps/api/src/insurance/engine.ts` | Gemeinsamer Fall, bestätigte Versionen, Analyse, Bedarf, Review, Fortschritt, Gesprächskontext |
| `insurance/store.ts`, `auth.ts`, `http.ts` | Verschlüsselung, Besitzer/Rollen, Sitzungen, CSRF, Grenzen, geschützte HTTP-/SSE-Schnittstellen |
| `insurance/products.ts`, `journey.ts`, `documents.ts` | Erklärbare Produktauswahl, Dokumentnachweise, gespeicherte Demo-State-Machine |
| `insurance/advisory.ts`, `graph.ts`, `comparison.ts` | Bestätigbare KI-Vorschläge, exakte Grafikfakten, Variantenvergleich |
| `insurance/dossier.ts`, `telemetry.ts` | Zwei Summary-Sichten desselben Snapshots, Druckexport, NPS und aggregierte Funnel-Signale |

Earnie kann `createLifeRuntime()` bzw. `createLifeInsuranceApp()` verwenden oder diese Module in den gemeinsamen NestJS-Prozess einbinden. Der verschlüsselte Fall ist die zentrale JSON-Quelle. Ein zweiter unabhängiger Fallstore würde die Versionsgarantien umgehen und soll bei der Integration vermieden werden. Bei späterem Ersatz durch Pax-Storage bleiben Bestätigungs-, Review- und Transaktionsregeln erhalten.

## Fachliche Rechenregeln

- `null`, bestätigte Null, Schätzung und Fachreview bleiben getrennt. Jahres-/Monatsflüsse und einmaliges Kapital sind unterschiedliche Größen. Kapitalbestände werden nie über eine Zeitreihe summiert.
- Bruttoeinkommen wird nicht als verfügbares Netto verwendet; bereits enthaltene Steuern, Beiträge und verschachtelte Ausgaben werden nicht doppelt abgezogen. Negative Budgets bleiben sichtbar. Rechner-Vorschläge überschreiben keine bestätigten Kundenangaben.
- Aktiva besitzen Zuordnungen, Freigabezeitpunkte und optional Eigentümer. Gebundene 3a-/PK-Mittel sind nicht automatisch frei. Derselbe Vermögensteil finanziert nicht mehrfach verschiedene Ziele.
- Invalidität und Todesfall bleiben nach Person sowie Krankheit/Unfall getrennt. Partnerlohn ist bereits im Provider-`IncomeTotal` enthalten und wird nicht erneut addiert. Deklarierte private Risiko-Renten werden einmal abgezogen. Ein vom Provider begrenzter Zielbedarf ersetzt den ausdrücklich erfassten Bedarf nicht.
- Todesfallkapital ergibt sich aus einer offen gewählten endlichen Schutzdauer und Renditeannahme, zusätzlichen Einmalkosten/gegebenenfalls separater Schuldentilgung, bestehendem Todesfallkapital und der bestätigten Strategie zur Verwendung freier Mittel. Wer freie Mittel zuerst einsetzen will, erhält entsprechend weniger zusätzlichen Versicherungsbedarf. Wer sie für andere Ziele bewahren will, bestätigt diese Abwägung ausdrücklich.
- Finanzierungsfähigkeit wird sowohl im Haushalt als auch für die betroffene Person geprüft. Der bestätigte persönliche Jahresrahmen ist keine berechnete Pax-Prämie. Zusätzliches Sparen und bereits laufende Vorsorge-/3a-Beiträge sind getrennt; der aktuell konservative 3a-Vorschlag zieht den gesamten erfassten bestehenden 3a-Beitrag von der persönlichen Grenze der ersten passenden Person ab.
- Familienvarianten verwenden nur die bestätigte Lohn-/Betreuungskostenannahme. Bestehende PK-Leistungen werden nicht proportional zum Lohn umgerechnet; Auswirkungen bleiben prüfpflichtig. Betreuungs-/Unterhaltsdauer wird nicht pauschal mit 18 angenommen.
- Eigenheim: Quote, Kaufnebenkosten, Reserve, Zins, Unterhalt und Amortisation sind sichtbare Annahmen. Finanzierungslücke und bedingte Folgekosten bleiben erkennbar. Keine Kreditzusage und keine stillschweigende 3a-Freigabe.
- Pensionierung: Erwerbsende und Rentenbeginn je Person sind getrennte Zeitpunkte; dazwischen liegen Überbrückungsphasen. Arbeitsphasen verwenden den aktuellen Budgetbedarf, spätere Phasen den bestätigten Ruhestandsbedarf auf derselben Netto-/Preisbasis. Die monatliche nominale Projektion zeigt beschränktes Kapital und erste ungedeckte Entnahmen. Gebundene zusätzliche Sparbeträge finanzieren eine Überbrückung erst nach ausdrücklich angenommenem Freigabedatum. Voller Kapitalbezug und volle Rente aus demselben Vorsorgeasset werden ohne unterstützten Split abgewiesen.

Geburtsmonate, konkrete Frühpensionierungskürzungen, Teilrenten, PK-Reglemente, Bezüger-/Begünstigtenrecht und Bezugs-/Steuerberechtigung benötigen Fachprüfung; keine Simulation stellt eine garantierte Rentenzusage dar. Die lokale Zeitachse ist ausdrücklich eine zusätzliche Liquiditätsillustration mit dem eingegebenen Zusatzsparen: bestehende private Prämien werden dort nicht nochmals pauschal als Vermögenszuwachs angesetzt. Bereits laufendes Sparen geht in die gesonderte Provider-Pensionierungsprojektion ein. Gebundene Bestände werden lokal zum eingegebenen nominalen Betrag freigegeben; unbekannte künftige Leistungen, Kosten oder Renditen aus bestehenden Verträgen werden nicht erfunden. Beide Modelle werden nicht addiert und ihre Abstimmung ist ein eigener Review-Grund. Beträge aus vlot und dem Musterfall werden nicht ohne identische Voraussetzungen mit diesen Läufen gleichgesetzt.

## 24 echte Rechenoperationen

`saving3aLimits`, `ageLimits`, `riskBase`, `risk`, `retirementBase`, `retirement`, `income`, `budgetProposal`, `saving`, `consumption`, `searchLocation`, `location`, `incomeFortuneTax`, `saving3a`, `capitalTax`, `purchaseP2`.

Die sechs optionalen Schätzpfade werden über `/calculator-estimates` ausdrücklich vor Bestätigung aufgerufen; fehlende Steuer-/Konfessions-/Ortsangaben werden nachgefragt. Schätzungen verändern das Profil nicht. Die zusätzlichen acht Operationen sind ebenfalls implementiert und live geprüft: `taxBaseInfo`, `searchLocationGeo`, `estateGainFields`, `estateGainTax`, `inheritanceAll`, `inheritanceGroup`, `inheritanceBeneficiary`, `corporateEntityTax`. Sie werden ausdrücklich über die geschützte Zusatzrechner-Schnittstelle aufgerufen und verändern weder bestätigte Profile noch aktive Finanzläufe automatisch. Unternehmens-/Grundstückgewinn-/Erbschaftssteuern werden nicht ungefragt in jede Lebensversicherungsberatung eingerechnet.

Der Providerzugang ist auf den dokumentierten Host und Operationspfade begrenzt. Maximal zwei gleichzeitige Requests, begrenzte Warteschlange, fünf Sekunden je Versuch, höchstens ein Retry bei vorübergehenden Fehlern, keine Redirects, keine Wiederholung bei 401/403. Fehler geben keine Token oder Provider-Payloads preis. Live-Fehler wechseln niemals still zu Replay; Replay trifft ausschließlich bei vollständigem identischem Operations-/Request-Hash.

Ein HTTP-200 ist keine fachliche Freigabe. Die beobachteten Risikoantworten mit Code `0` bleiben `requires_review`; eine Reviewer-Entscheidung ist gesondert sichtbar und verändert diese ursprüngliche Datenqualität nicht.

## Darios Agent dynamisch informieren

Der Kunde kann `/agent-access` aufrufen; der kurzlebige Bearer-Token ist ausschließlich für Earnies serverseitige Integration bestimmt. Dieser Agent darf nur für den freigegebenen Fall Kontext/Events lesen und erlaubte Änderungen vorschlagen. Er darf weder den vollständigen Fall lesen noch Kundenangaben bestätigen, Reviews genehmigen oder Verträge auslösen.

1. Earnie liest vor jeder Antwort `/advisor/context`. Dieser Stand enthält Versionen, aktuell zulässige Fakten, ausgewählte Grafikdaten, letzte passende Szenariodifferenz, Rückfrage, Sprache, Tempo und Fortschritt. Er enthält keine Provider-Tokens oder Gesundheitsrohdaten und erteilt keine Erlaubnis für externe Modellübertragung.
2. `/advisor/events` liefert SSE-Ereignisse `advisor.context.updated` mit Referenzen und Kontextrevision, keine vollständigen finanziellen Datensätze. Nach einem Event wird der aktuelle Kontext neu gelesen. Reconnect liefert den aktuellen Snapshot; ein garantierter vollständiger Event-Replay wird nicht versprochen.
3. Einkommens-/Profil-/Szenariowechsel können eine laufende Antwort ungültig machen. Earnie/Dario vergleichen Run, Profil, Kontext und Turn und verwerfen dann den alten Antwort-/Audiostand. Tempoänderungen und neue Vorschläge werden vor der nächsten Antwort eingelesen. Audio-Unterbrechung und Playback-Events implementiert Dario.
4. Ein Transkript erzeugt nur `/advisor/proposals`. Der Kunde akzeptiert über `/accept`; danach bleiben Gesamtbestätigung und Neuberechnung getrennt notwendig. Eine Änderung des Entwurfs macht einen älteren Vorschlag ungültig.
5. Luca setzt `/graph-context` mit exaktem Fall/Run/Profil/Szenario/Person/Kennzahl/Zeitraum. Zeitachsenbereiche bleiben Monatsserien; längere Bereiche erhalten eine kompakte Bereichszusammenfassung. Gesprochene Zahlen dürfen nur aus den passenden freigegebenen Fakten kommen.

Der fachliche Fortschritt steht unter `context.progress`, einschließlich Pflichtgruppen und getrenntem `reviewOpen`. 100 % Aufnahme bedeutet keine 100 % Absicherung. Lukas nutzt diese Daten für den vereinbarten Fortschrittsring am Agenten.

## Gespeicherter Demo-Vertragsweg

`bestätigter Bedarf → aktueller Lauf → Empfehlung → getrennte Reviewer-Freigabe → explizite Produktauswahl → Demo-Konfiguration → Dokumentbestätigung → Demo-Antrag → Einreichung → Reviewer-Prüfung → Demo-Annahme → Demo-Police → Portal`.

`/reviews` stellt eine prüfbare Übergabe bereit, auch bei noch unvollständiger Aufnahme. `/review-decisions` erfordert die separate Reviewer-Sitzung, alle offenen Gründe und fünf explizite Prüfkriterien. Reviewer können Rückfragen/Abbruch statt Freigabe wählen. Neu eröffnete Prüfung nimmt die Freigabe zurück.

`/demo-quotes`, `/demo-applications`, `/demo-applications/submit`, `/demo-applications/start-review`, `/demo-applications/decisions`, `/demo-policies` sind getrennte Zustandsübergänge. Für Schreibaktionen sind aktuelle Revision und Idempotenzschlüssel nötig; gleiche Schlüssel mit anderer Nutzlast werden abgewiesen. Fehlende Dokumentbestätigung, abgelaufene Konfiguration, veralteter Lauf, fehlende persönliche Mittel oder nicht angenommener Antrag blockieren Folgeschritte. Antragsprüfung und Policenerstellung sind ausschließlich der Reviewer-Rolle erlaubt.

Die bereitgestellten zwölf Pax-PDFs werden ausschließlich über eine feste Dokument-Allowlist ausgeliefert. Eine Demo-Konfiguration bindet Dokument-ID und SHA-256. Archivstand und notwendige Aktualitätsprüfung bleiben sichtbar. `/portal` lädt gespeicherte Review-/Konfigurations-/Antrags-/Policenobjekte. `/summaries` liefert zwei Sichten mit demselben `snapshotId`; `/dossier?format=html&audience=customer` ist ein escaped, druckbarer Export, den der Browser auch als PDF speichern kann. Kein automatischer Versand.

Alle Prämien sind `null` mit `pax_tariff_api_unavailable`. Alle Policen tragen **DEMO – KEIN VERSICHERUNGSSCHUTZ**, `coverageInForce:false` und `legalEffect:'none'`. Echte Pax-Tarifierungs-, Underwriting-, Identitäts-/AML-, Signatur- und Policen-APIs wurden nicht bereitgestellt. Diese Übergänge sind deshalb ausdrücklich lokale Demo-Funktionen. Ein echter Abschluss wird durch den Backend-Code nicht freigeschaltet.

## Datenschutz und technische Grenzen

Synthetische Datenklassifikation und Hinweisversion sind Pflicht; echte Kundendatenklassifikation und Gesundheitsrohdaten werden an der Eingabeschnittstelle abgewiesen. Fachwerte bleiben verschlüsselt gespeichert; Audit-Ereignisse enthalten technische IDs/Aktionen statt vollständiger Profile. Kunden dürfen ausschließlich eigene Fälle lesen. Die Reviewer-Rolle sieht Fälle erst nach einer Review-Anfrage. Agenten erhalten minimale fallgebundene Projektionen.

Sitzungen laufen nach einer Stunde, Agentzugänge nach 15 Minuten, Fälle nach 24 Stunden aus. Die automatische Bereinigung läuft minütlich, nach Neustart wieder; abgelaufene Fälle sind sofort nicht mehr abrufbar. `DELETE /cases/:id` entfernt den Fall mit zugehörigem NPS und Agentzugängen. Technische Audit-Einträge werden begrenzt und nach 24 Stunden regelmäßig bereinigt; Löschung ist dort als technische Aktion dokumentiert. Für den produktiven Betrieb braucht es eine Pax-freigegebene Aufbewahrungs-/Lösch-/Backup-Strategie, Schlüsselverwaltung, TLS/IAM und rechtliche Prüfung.

Optionales `/feedback` nimmt einen NPS-Wert ohne Freitext je erreichtem Schritt an. `/insights` liefert ausschließlich der Reviewer-Rolle aggregierte Phasen-/NPS-/Blocker-Signale. Zehn Minuten Inaktivität ohne Police ist ausdrücklich ein potenzieller Drop-off, kein nachgewiesener Abbruch. Diese Feedback-/Insights-Routen führen keine externen Analytics-/Modellaufrufe aus.


## Vollständige Tool-Abdeckung und vier Sprachen

Alle 24 Operationen der bereitgestellten APICalc-Spezifikation sind nun im Server-Allowlist-Adapter verfügbar und im erweiterten Live-Test ausgeführt. Die bisherigen 16 bleiben im bestehenden Beratungs-/Schätzweg; die zusätzlichen acht sind gezielte Zusatzwerkzeuge.

`GET /api/cases/:id/calculator-tools` liefert Operationen, monetäre Eingabefelder und den isolierten fachlichen Geltungsbereich. `POST` auf denselben Pfad braucht `expectedCaseRevision`, `noticeVersion`, `allowSyntheticCalculatorTransfer:true`, `requestUnits:"CHF_CENTS"`, `operation` und `request`. Die Eigenschaftsnamen in `request` folgen der bereitgestellten API, **sämtliche monetären Werte sind ganze CHF-Rappen**. Der Server konvertiert erst an der Providergrenze. Nicht monetäre Felder wie Steuerort-ID, Jahre, Gruppen-/Begünstigtencodes oder Koordinaten werden nicht skaliert. Beispiel für eine isolierte Erbschafts-/Schenkungssteuerübersicht:

```json
{
  "expectedCaseRevision": 2,
  "noticeVersion": "lifemap-synthetic-v2",
  "allowSyntheticCalculatorTransfer": true,
  "requestUnits": "CHF_CENTS",
  "operation": "inheritanceAll",
  "request": { "TaxLocationID": 400100000, "Amount": 10000000 }
}
```

Das Beispiel entspricht CHF 100’000. Ergebnisse behalten Begünstigtenalternativen getrennt; sie werden nicht summiert oder ungeprüft auf Lebensversicherungsauszahlungen angewendet. Fehlende Zustimmung, falsche Einheiten, Rappenbruchteile, unbekannte Operationen und fremde Fälle werden vor dem Provideraufruf abgewiesen. Geokoordinaten stammen ausschliesslich aus der ausdrücklich übergebenen synthetischen Anfrage; kein Geräte-/Browser-GPS wird abgefragt. Ausführungen sind verschlüsselt am Fall als `toolRuns` gespeichert.

Die zentrale lokale Textsammlung enthält 191 vollständige Schlüssel in **DE/FR/IT/EN**. `GET /api/translations?locale=fr` liefert das passende Angular-/Agent-Wörterbuch; alternativ wird `Accept-Language` berücksichtigt. `/privacy` liefert zusätzlich einen lokalisierten `display`-Abschnitt. Fehler haben stabile technische `code`-Werte und eine übersetzte `message`; dafür `X-Locale` oder `Accept-Language` mitsenden.

`PATCH /api/cases/:id/preferences` mit `{ "locale":"fr" }` wechselt die Sprache jederzeit. Profilversion, Rechenlauf, finanzielle Eingabehashes und Kandidatenidentitäten bleiben unverändert; die Kontextrevision steigt und SSE meldet die Änderung. Regelmässige Budgetanfragen und Orts-/Geosuche verwenden die passende Provider-Sprachnummer.

Kundenlesbare Rückfragen, Produktbeschreibungen, Empfehlungsbegründungen/-bedingungen, Alternativen, Risiko-/Status-/Perioden-/Fortschrittsbeschriftungen, Disclaimer, Datenschutzanzeige und beide Dossier-Sichten werden lokalisiert. Rechenantworten ergänzen `presentation`; der gemeinsame Fall bietet dieselbe aktuelle Projektion unter `presentation`. Der HTML-Export nutzt die Fall-Locale, Schweizer Zahlenformate und lesbare Abschnitte anstelle technischer JSON-Blöcke. Technische IDs, Original-Provenienz und kanonische Rechendaten bleiben unverändert. **Luca soll die Präsentationsfelder und den Katalog rendern; Earnie/Dario verwenden die aktuelle `locale` vor jeder Antwort.** Angular-Oberfläche, generierter Dialog und reale Sprachausgabe müssen von den jeweiligen Teammitgliedern angebunden werden.

Archivierte Vertrags-PDFs bleiben gekennzeichnete deutschsprachige Originale. Sie werden nicht maschinell als rechtsverbindliche französische, italienische oder englische Dokumente ausgegeben; dafür sind aktuelle von Pax freigegebene Sprachfassungen erforderlich. Dies wird auch im Übersetzungskatalog und im Dossier erklärt.


## Gemeinsame vollständige Verträge und Datenhaltung

Der vollständige, versionierte `InsuranceCaseDto` und alle Fachdaten-Unterobjekte werden aus `@pax/contracts` importiert und dort aus Zod abgeleitet. Es gibt keine zweite handgeschriebene Backend-Definition dieser Fachdaten mehr. Private Besitz-/Sitzungs-/Idempotenzdaten bleiben serverseitige Ergänzungen und werden nicht im HTTP-Fall ausgegeben. Fallantworten tragen `schemaVersion:"1.0"`; Create, GET, Draft-Patch und Bestätigung verwenden dasselbe validierte Format. Auch Agent-Kontext, SSE, Rechenausgabe, Portal und Summary verwenden gemeinsame Laufzeitverträge.

Der [Team-API-Leitfaden](../documentation/baselhack/plans/team-api-guide.md) dokumentiert Rollen, konkrete Endpunkte, Payloads, Versionsschutz und das Nachladen für Voice. [API und Datenbank](../documentation/baselhack/plans/persistence-and-api.md) erklärt den vorhandenen verschlüsselten Speicher und den konkreten späteren PostgreSQL-Ausbau. Eine SQL-/Cloud-Datenbank wurde nicht eingerichtet.

Die [Client-Beispiele](examples/contracts/team-client.ts) kompilieren mit `npm run typecheck:clients` ohne Node-Typen. `npm run contracts:export` erzeugt zehn [standalone JSON-Schemas](packages/contracts/schemas/) für TypeScript-fremde Komponenten. `npm test` prüft Browser-Typen, Export-Aktualität und 121 automatisierte Tests. VoiceLog, AgentReply und Playback sind bereitgestellte Team-Nachrichtenschemas; ihre tatsächlichen STT-/LLM-/TTS-/Avatar-Transporte bleiben die Implementierung der zuständigen Teammitglieder.

## Dialogextraktion und Vorschlagspakete

Ernis Modul bindet über die autorisierte Extraktor-Projektion und atomare Vorschlagspakete an denselben Runtime/Fallservice an. Siehe [Integration, Bestätigung und Zuständigkeiten](../documentation/baselhack/plans/erni-extractor-integration.md). `npm run demo:extraction` führt den synthetischen Backend-Durchlauf aus; `npm run contracts:extraction-examples` exportiert die sechs JSON-Beispiele in `fixtures/extraction`. OpenAI wird von diesem Durchlauf nicht aufgerufen.

Der erste vollständige Dialog-Moduldurchlauf ist über `npm run demo:erni-dialog` ohne externe Dienste und über `npm run demo:erni-dialog:openai` separat mit einem serverseitigen `OPENAI_API_KEY` ausführbar. Beide prüfen den Jahresbrutto-Pflichtfall und unverändertes Budget-Netto; der zweite sendet ausschließlich den eigens erfundenen Demo-Ausschnitt an OpenAI. [Startbefehle, Grenzen und Verarbeitungshinweis](apps/api/src/erni-dialog/README.md). Darios echter Voice-/Bestätigungsanschluss ist damit noch nicht abgenommen.

Den Prüfstand im Angular-Client gegen den echten Fallservice startet `npm run demo:customer-review` mit synthetischen Daten; Details stehen im [Web-README](apps/web/README.md).

Gebundene Kundenbestätigungen und der Gesprächsstatus beantworteter Unklarheiten sind in [Darios/Ernis Voice-Anbindung](../documentation/baselhack/plans/voice-confirmation-and-dialogue.md) beschrieben. `npm run demo:voice-confirmation` testet ausschließlich jährliches Brutto mit zwei getrennten synthetischen Antworten; Budget-Netto bleibt unverändert.

Die providerneutrale [Offline-Voice-Pipeline](apps/api/src/voice/README.md) prüft Audio → STT → Maskierung → Dialog → TTS → Wiedergabe über injizierte Adapter. `npm run test:voice` testet Ablauf, Abbruch und echte Runtime-Bestätigungen; `npm run evaluate:voice` liefert getrenntes Funktions-/Codequalitätsfeedback mit höchstens fünf Versuchen. Der verpflichtende Maskierungs-Hook bereitet die spätere Presidio-Mittelschicht vor. Echte STT-/TTS-Dienste und Browser-Audio sind damit noch nicht getestet.

Der gemeinsame Schalter für persönliche Beratung ist als `handover` in Fall, Kontexten und SSE verfügbar. [Routen und Zuständigkeiten](../documentation/baselhack/plans/human-advisor-handover.md). `npm run demo:handover` prüft Request/Stoppsignal/Replay/Resume ohne Anruf oder externe API-Aufrufe.

## Voice am gemeinsamen Fall

[Anbindung für Dario und Erni](../documentation/baselhack/plans/voice-backend-integration.md): Nest-Voice-Modul, serverseitige OpenAI-/ElevenLabs-Adapter, explizite synthetische Voice-Zustimmung, verschlüsselte finale Transkripte und quellengebundene atomare Vorschläge. `npm run demo:voice-integration` prüft den vollständigen Backend-Fluss ohne Mikrofon oder externe Modellaufrufe. `npm run contracts:voice-integration-examples` erzeugt die Team-JSON-Beispiele. Voice bleibt ohne `PAX_SYNTHETIC_VOICE_ENABLED=1` deaktiviert.

## Deploy on Cloudflare

Der Worker **`paxi`** liefert Angular mit `live-production` und die Nest-API unter derselben HTTPS-Origin aus: `https://paxi.<subdomain>.workers.dev`. Der Demo-Start ist bewusst ohne Zugangscode offen. Darios separater Voice-Agent wird nicht deployt; Persona und Skills sind für die integrierte Live-Voice gebündelt.

Voraussetzungen: Node 22+, npm, Cloudflare-Konto mit Workers/Durable Objects und workers.dev-Subdomain. Die folgenden Konto- und Deploy-Befehle sind für die spätere Freigabe vorgesehen. Aus `code/` installieren und lokal prüfen:

```sh
npm ci --ignore-scripts
npm run build -w @pax/worker # nur wrangler deploy --dry-run
npm run typecheck -w @pax/worker
npm test
cd apps/worker
npx wrangler login
# Alternativ: CLOUDFLARE_API_TOKEN sicher in der Shell/CI bereitstellen.
```

Einmalig aus `code/apps/worker` die Secrets setzen (Werte interaktiv eingeben, niemals committen):

```sh
# Einmal einen Schlüssel erzeugen und sicher im Passwortmanager aufbewahren:
openssl rand -base64 32
npx wrangler secret put LIFEMAP_STORE_KEY
npx wrangler secret put LOGISMATA_BEARER_TOKEN
npx wrangler secret put OPENAI_API_KEY
# Optional, nur bei Nutzung:
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_AGENT_ID
npx wrangler secret put PAX_CUSTOMER_ACCESS_CODE
npx wrangler secret put PAX_REVIEWER_ACCESS_CODE
```

`LIFEMAP_STORE_KEY` ist ein base64-kodierter 32-Byte-Schlüssel. Bei Folge-Deployments denselben Schlüssel behalten: Verlust oder Austausch macht gespeicherte Fälle unlesbar. Zugangscodes sind optionale Login-Overrides; ohne sie werden Fallback-Codes dauerhaft erzeugt. Sie sperren den Demo-Start nicht. `.dev.vars` ist nur für lokale Entwicklung, kein Ersatz für Remote-Secrets.

Nicht geheime Vars in `apps/worker/wrangler.jsonc`:

| Variable | Wirkung |
| --- | --- |
| `PAX_DEMO_START=1` | Offenen Demo-Start aktivieren |
| `PAX_SYNTHETIC_VOICE_ENABLED=1` | Integrierte Live-Voice aktivieren |
| `PAX_SYNTHETIC_EXTRACTION_ENABLED=1` | Modellbasierte Extraktion aktivieren |
| `LIVE_MODEL=gpt-live-1`, `LIVE_VOICE=juni` | Voice-Modell und Stimme |
| `PAX_PUBLIC_ORIGIN=""` | Request-Origin verwenden; alternativ exakt `https://paxi.<subdomain>.workers.dev` für Schreibzugriffe eintragen |

Deployment und automatische Prüfung aus `code/` (`<subdomain>` ersetzen):

```sh
npm run deploy -w @pax/worker
WORKER_URL=https://paxi.<subdomain>.workers.dev npm run check -w @pax/worker
npm run tail -w @pax/worker
```

Der Build erzeugt Backend, optimiertes Live-Web, Prompts und PDF-Manifest. Provider-Prüfungen melden fehlende Eingaben als übersprungen; das ist kein vollständiger Live-Nachweis. Für einen echten Voice-Setup-Check zusätzlich `VOICE_SDP_FILE` mit einem frischen Browser-SDP-Angebot angeben. Danach auf einem Telefon die öffentliche URL öffnen: Einwilligung erteilen, Mikrofon erlauben, Paxi sprechen hören, eine Berechnung ausführen und Diagramme prüfen. HTTPS von workers.dev ermöglicht den Mikrofonzugriff. Nach Updates alte Tabs schliessen und neu öffnen (Angular Service Worker).

Automatisches Deployment: [`.github/workflows/deploy-cloudflare.yml`](../.github/workflows/deploy-cloudflare.yml) läuft bei jedem Push auf `main` (und manuell über „Run workflow“). Zuerst Backend-Tests, Web-Tests und Worker-Typecheck; nur wenn alle grün sind, folgen `npm run deploy -w @pax/worker` und der automatische Check gegen https://paxi.rushworks.workers.dev. Deployments laufen nacheinander, nie parallel. Einmalig in GitHub unter Settings → Secrets and variables → Actions als Repository-Secrets anlegen:

| Secret | Inhalt |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Vorlage „Edit Cloudflare Workers“, beschränkt auf das Konto rushworks.io |
| `CLOUDFLARE_ACCOUNT_ID` | Konto-ID von rushworks.io (Dashboard → Workers & Pages, rechte Spalte) |

Die Worker-Secrets (`LIFEMAP_STORE_KEY`, `LOGISMATA_BEARER_TOKEN`, `OPENAI_API_KEY`) bleiben in Cloudflare und überstehen jedes Deployment; die CI sieht sie nie. Manuelle Deployments von einem Rechner brauchen weiterhin `CLOUDFLARE_ACCOUNT_ID` in der Shell, sobald das Login mehrere Konten kennt.

Logs: `tail` mit Ctrl-C beenden; dauerhaft unter Cloudflare Dashboard → Workers & Pages → paxi → Logs/Observability ansehen. [`observability.enabled`](https://developers.cloudflare.com/workers/wrangler/configuration/#observability) ist eingeschaltet. Rollback aus `code/apps/worker`:

```sh
npx wrangler deployments list
npx wrangler rollback # vorherige Version; alternativ: npx wrangler rollback <VERSION_ID>
```

Ein [Rollback](https://developers.cloudflare.com/workers/wrangler/commands/workers/#rollback) aktiviert sofort alten Code; er stellt keine alten Falldaten oder verlorenen Schlüssel wieder her. Danach automatischen Check und Telefon-Smoke-Test wiederholen.

Kosten während der Jury begrenzen:

- OpenAI: API Dashboard → Settings → Organisation/Projekt → Limits → Monthly spend limit und Warnschwellen setzen; falls verfügbar „Enforce a hard limit“ aktivieren, reine Warnungen stoppen keine Requests ([Anleitung](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)).
- ElevenLabs: Subscription → Manage Subscription → Usage based billing deaktivieren oder Change threshold begrenzen (Legacy); bei PAYG nur ein festes Guthaben bereitstellen ([Abrechnung](https://elevenlabs.io/docs/overview/administration/billing)).

Der Logismata-Token läuft am **2026-11-03 um 23:59:59** ab. Neuen Token im Challenge-Hub unter [Tools](https://pax-hackathon-2026.vercel.app) holen und aus `code/apps/worker` mit `npx wrangler secret put LOGISMATA_BEARER_TOKEN` ersetzen; danach Berechnung prüfen.

Akzeptierte Grenzen: Alle Besucher teilen eine Durable Object-Instanz (für die Jury ausreichend). Maximal 25 Fälle; ein neuer Demo-Start ersetzt bei vollem Store ersetzbare Fälle (zuerst unerreichbare, dann die ältesten) und kann dabei eine aktive Besuchersitzung beenden. `/api/demo/start` hat kein Rate-Limit. Architektur, lokale Einrichtung und Persistenzprüfung: [Worker-Guide](apps/worker/README.md).
