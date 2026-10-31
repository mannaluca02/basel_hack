# Pax LifeMap – Logik-Backend, erster lauffähiger Stand

Stand: 31.10.2026 · Owner: Valentin · TypeScript, NestJS, Zod · Node 22.

Dieses Paket implementiert den ersten Teil von LOG-01 bis LOG-03 und erste Szenariofunktionen. Es liefert gemeinsame Laufzeitschemas, Budget/Kapital/Drei-Säulen-Ausgaben, einen serverseitigen Logismata-Adapter und eine lokal startbare Demo. Die Demo verwendet ausschließlich feste synthetische Fälle. Die vollständige Advisor-/Vertragsjourney bleibt weitere Arbeit des Teams.

## Start

Im Repo-Verzeichnis `code/`:

```bash
npm ci --ignore-scripts
npm test
npm start
```

Der Server startet auf `http://127.0.0.1:3000`. `PORT=3001 npm start` wählt bei Bedarf einen anderen Port. Er bindet ausschließlich an Loopback. Angular auf `http://localhost:4200` oder `http://127.0.0.1:4200` erhält CORS-Zugriff. Für eine Netzwerk-/Kundendemo wird das Modul in Earnies geschützten Fall-/Session-Backend integriert.

Ohne HTTP-Server lässt sich der gesamte synthetische Durchstich mit `npm run demo` ausführen. Die normalen Tests und die Demo benötigen keinen API-Token und führen keine externen Rechenaufrufe aus.

```bash
curl -sS http://127.0.0.1:3000/api/demo/health
curl -sS http://127.0.0.1:3000/api/demo/fixtures
curl -sS -X POST http://127.0.0.1:3000/api/demo/calculations \
  -H 'Content-Type: application/json' \
  -d '{"fixtureId":"household","scenario":"family"}'
curl -sS http://127.0.0.1:3000/api/demo/provider-examples/risk
```

Berechenbare Demo-Varianten: `baseline`, `family`, `home`. Der HTTP-Demo-Eingang akzeptiert Fixture-/Varianten-IDs. Profil-Payloads oder Provider-URLs sind keine erlaubten Felder.

## Aufbau und Verantwortlichkeiten

| Pfad | Inhalt | Anschluss |
|---|---|---|
| [packages/contracts/src/index.ts](packages/contracts/src/index.ts) | Zod-Schemas und abgeleitete DTO-Typen | Luca und Earnie verwenden dieselben Verträge |
| [packages/domain/src/index.ts](packages/domain/src/index.ts) | Reine Fachfunktionen | Budget, Kapital, Säulen, Datenreife, Szenarien |
| [CalculationModule](apps/api/src/calculation/calculation.module.ts) | Exportierter NestJS-Fachservice | Earnie importiert ihn ins gemeinsame Backend |
| [CalculationService](apps/api/src/calculation/calculation.service.ts) | I03→I04, Hash-/GraphContext-Prüfung | Kein eigener Login und kein zweiter Fallstore |
| [Logismata-Adapter](apps/api/src/logismata/client.ts) | Getrennte Replay-/Live-Provider | Nur serverseitig, explizit konfiguriert |
| [DemoController](apps/api/src/demo/demo.controller.ts) | Fester synthetischer HTTP-Durchstich | Direkter Startpunkt für Lucas UI |
| [household.json](fixtures/household.json) | Erfundenes Paar und drei Varianten | Kein realer Studien-/Kundenfall |

## Übergabe an Earnie: gemeinsamer JSON-Fall

`CaseSnapshotSchema` beschreibt den hier benötigten finanziellen Ausschnitt: bestätigter Profilstand, Personen/Einkommen, Ausgaben, Sicherheitspuffer, Assets/Zuordnungen und Säulenleistungen. Zusätzliche Advisor-/Ziel-/Journeydaten bleiben im gemeinsamen Fallmodell des Teams. Die Schema-Version ist `1.0`; Erweiterungen werden gemeinsam abgestimmt.

`CalculationModule` importieren, `CalculationService` injizieren. Nach Autorisierung, Datenvalidierung und erforderlicher Kundenbestätigung übergibt der Fallservice einen unveränderlichen Snapshot:

```ts
const request = createAnalysisRequest(
  confirmedSnapshot,
  { kind: 'baseline' },
  'baseline_v1',
  ['budget', 'capital', 'pillars'],
);
const result = calculationService.analyze(request);
```

`createAnalysisRequest` und `CalculationService` werden aus [calculation.service.ts](apps/api/src/calculation/calculation.service.ts) importiert. Der Integrationsdienst prüft die Fallberechtigung und leitet `caseId`, Versionen und bestätigte Daten aus seinem Fallstore ab. Ein vom LLM gesendetes `confirmation="confirmed"` ersetzt diese Prüfung nicht.

Das Ergebnis trägt `runId`, `profileVersion`, `scenarioVersionId`, `calculationInputHash`, `modelVersion`, Geldwerte mit Periode/Einheit, Quellenreferenzen, Status je Bereich und nachvollziehbare Issues. Der Snapshot wird vom Rechenmodul weder gespeichert noch überschrieben. Earnie speichert Request/Result am passenden Fallstand und veröffentlicht danach I10 für den Gesprächskontext.

Der Hash enthält den finanziellen Snapshot, die Szenarioannahmen, angeforderte Bereiche und Modellversion. Eine rein technische `caseRevision` ist davon ausgenommen. Ein anderer finanzieller Eingabestand passt nicht zu einem alten Hash; falsche Hashes werden mit `INPUT_HASH_MISMATCH` abgewiesen.

## Übergabe an Luca und Dario/Lukas

Luca kann für den ersten UI-Durchstich die drei Demo-Varianten direkt aufrufen. Alle Geldwerte sind **ganze CHF-Rappen**. `period="year"` bedeutet annualisierten Snapshot-Cashflow, `once` bedeutet Kapital. Eine Umrechnung für die Anzeige verändert keine zugrunde liegende Fachrechnung.

Verfügbare Kennzahlen sind unter anderem `cashflowAnnual`, `affordableContributionAnnual`, `deficitAnnual`, `freeCapital`, `totalCapital`, `pillar3Capital` und `home_fundingGap`. `capitalBreakdown` zeigt je Asset den Betrag, bestehende und neue Reservierungen, freie Mittel und Ausschlussgründe. Säulenleistungen bleiben nach Person und Ereignis getrennt; Todesfall, Invalidität und Pensionierung werden nicht zusammengerechnet.

Für die Erklärungsgrundlage liefert `graphFacts(context, result, currentRequest)` ausschließlich passende Fakten. Aktuell unterstützte Grafik-IDs: `household_budget`, `capital_overview`, `pillar_overview`. Geprüft werden Fall, Run, Profil-/Szenarioversion, aktueller Eingabehash, Kennzahl, Personenbezug und Zeitraum. Die IDs eines zukünftigen Zeitachsen-Renderers werden gemeinsam ergänzt.

Dario erhält später Earnies `AgentReply` auf diesen Fakten. Lukas kann `result.progress` direkt als I09-Grundlage verwenden: sechs definierte Aufnahmengruppen und `domain="data_capture"`. Hundert Prozent dieser Gruppen bedeutet vollständige Aufnahme dieses Ausschnitts; offene Fachprüfung bleibt über `reviewOpen` sichtbar. Die vollständige Risiko-/Lebenssituationsaufnahme wird mit weiteren Feldern ergänzt.

## Fachregeln dieses Stands

- Unbekannte/unbestätigte Werte erzeugen `needs_input` und gegebenenfalls `null`-Kennzahlen. Eine erfasste Null bleibt eine verwendbare Null.
- Bruttoeinkommen wird nicht als verfügbares Netto verwendet. Vor-Steuer-Netto benötigt eine ausdrückliche Steuerposition; gemischte Steuerbasen erfordern Zuordnung.
- Enthaltene Ausgaben besitzen `includedInExpenseId`. Detailpositionen werden nicht zusätzlich zu ihrer Summe abgezogen. Bereits enthaltene Einkommensteuern werden berücksichtigt.
- Negative Cashflows bleiben als Fehlbetrag sichtbar. Sicherheitspuffer und regelmäßige Rücklagen sind explizite, getrennte Annahmen.
- Reservierungen dürfen das Asset nicht übersteigen. Gebundene oder erst später verfügbare Mittel sind nicht aktuell frei. 3a-Guthaben werden nicht ungeprüft als Eigenmittel eingesetzt.
- Die Familienvariante verwendet eine bestätigte lineare Lohnannahme und zusätzliche Betreuungskosten. Bestehende PK-Werte bleiben Baseline-Fakten und sind für die neue Variante prüfpflichtig.
- Die Eigenheimvariante ersetzt die Miete durch explizite Beispielkosten, schützt die Reserve und reserviert finanzierbare Mittel. Ein Fehlbetrag bleibt sichtbar; die Kostenrechnung ist dann bedingt auf einen noch nicht finanzierten Kauf. Sie erteilt keine Kreditzusage.
- `simulateCapital` zeigt monatliche Spar-/Entnahmeperioden und die erste ungedeckte Entnahme. Renditeannahmen sind illustrativ; ein vollständiges Frühpensionierungs-/Leistungsphasenmodell folgt in LOG-04.

## Logismata: sechs implementierte Operationen

| Name im Adapter | Provider-Operation | Besonderheit |
|---|---|---|
| `saving3aLimits` | `APICalc_getSaving3aLimits` | Metadaten, persönliche Berechtigung separat |
| `ageLimits` | `APICalc_getAgeLimits` | Expliziter Provider-Sex-/Geburtsjahrparameter |
| `riskBase` | `APICalc_calculateRiskBase` | Ergebnis bleibt Schätzung |
| `risk` | `APICalc_calculateRisk` | Code 0 prüfpflichtig, unbekannter Bedarf sperrt Lückenwerte |
| `retirementBase` | `APICalc_calculateRetirementBase` | Ergebnis bleibt Schätzung |
| `retirement` | `APICalc_calculateRetirement` | Eigenständige Code-/Summen-/Bedarfsprüfung |

Replay lädt die vorhandenen [synthetischen API-Beispiele](../documentation/baselhack/references/api/examples/) aus dem Repo. Nur ein identischer vollständiger Operation-/Request-Hash passt. Bei abweichenden Eingaben folgt `REPLAY_MISS`; ein Archivwert wird nicht als neue Live-Berechnung ausgegeben. Die anderen archivierten Operationen, insbesondere Budget-/Steuer-/Sparrechner, haben in diesem Stand noch keinen implementierten Adapterpfad.

Der Live-Provider verwendet einen fest erlaubten Host, keine Redirects, maximal zwei gleichzeitige Aufrufe, begrenzte Warteplätze, fünf Sekunden Timeout je Versuch und höchstens einen Retry für vorübergehende Fehler. 401/403 werden nicht wiederholt. Lange `Retry-After`-Vorgaben führen zum Rückgabefehler. Fehlertexte enthalten keine Provider-Payloads oder Tokens. Es werden keine Rechenanfragen oder Antworten allgemein geloggt.

Der normale Demo-Server verwendet ausschließlich Replay. Ein ausdrücklich ausgeführter Metadaten-Smoke kann den bereits lokal vorhandenen Token nutzen:

```bash
npm run test:live
```

Dieser Befehl liest `documentation/baselhack/private/logismata.env` außerhalb von `code/` bzw. die Serverumgebung und fragt nur `saving3aLimits` mit `{}` ab. Er gibt Status/Anzahl der Kennzahlen aus. Zugangsdaten werden nicht in eine weitere Datei oder ins Client-Bundle kopiert.

## Noch offene Integration

Earnies Case-/Auth-/Persistenzschicht, atomare Ergebnisübernahme am aktuellen Fallstand und I10/SSE sind Anschlussarbeit. Ebenso offen bleiben vollständige mehrphasige Familien-/Pensionierungssimulation, gesetzlich/produktspezifische Leistungskoordination, Steuer- und Beitragskonvertierung, Empfehlungen und LOG-06-Vertragsstatus. Die aktuelle lokale HTTP-Demo stellt dafür keine echten Kundenendpunkte bereit.

Die automatischen Fach-/Adapter-/HTTP-Tests prüfen diesen ersten Implementierungsstand. Die vollständige Journey-Abnahme bleibt in der [geplanten Abnahmematrix](../documentation/baselhack/plans/implementation-plan.md#202-pflichtfälle) offen.
