# Erni: Extraktion, Vorschlagspakete und Bestätigung

Aktuelle Ergänzung für Dario und Erni: [Gebundene Voice-Bestätigung und Gesprächsstatus beantworteter Unklarheiten](voice-confirmation-and-dialogue.md).

Stand: 31.10.2026, ergänzt am 01.11.2026. Die Verträge (Extraktor-Kontext, Pakete, Ersetzen, Unklarheiten) gelten unverändert. Das hier geplante separate `ErniDialogModule` wurde nie angeschlossen und ist entfernt: Die Live-Extraktion läuft über `voice-lab/turns` mit GPT-Lives Hintergrundmodell oder dem eigenen Modellaufruf des Backends ([Live-Stimme](../../live-voice.md)).

## Die sieben Absprachen

1. **Integration:** Ernis Nest-Feature-Modul kann über `createLifeInsuranceApp(runtimeOptions, [ErniDialogModule])` im selben Prozess eingebunden werden. Der globale `LifeHttpModule` exportiert `LIFE_RUNTIME` und `LifeSessionGuard`. Derselbe Fallservice ist auch per HTTP erreichbar, falls Ernis Dienst separat läuft. Keine zweite Fallkopie oder eigene Schreibzugriffe auf den Store.
2. **Lesesicht:** `runtime.extraction.context(actor, caseId)` beziehungsweise `GET /api/cases/:caseId/advisor/extractor-context` liefert den aktuellen Entwurf, Personen-IDs, Feldwerte mit abgeleitetem Bestätigungsstatus, Vorschläge, Vorschlagspakete, Unklarheiten, Locale, Versionen und Entwurfshash. Der Zugriff ist auf den Kunden bzw. dessen fallbezogenen Agenten beschränkt. Keine vollständige Versionshistorie, Kalkulationshistorie, Vertragsunterlagen, Eigentümerkennung oder Zugangsdaten.
3. **Pakete:** `runtime.extraction.proposeBatch(...)` validiert alle Änderungen zusammen, ohne den Entwurf zu ändern. `acceptBatch(...)` validiert erneut und übernimmt das gesamte Paket in genau einer verschlüsselten Speichertransaktion und einer Revision. Es gibt keine Teilannahme und kein Rebasieren einzelner Felder.
4. **Korrekturen:** Neue Pakete können offene Vorgänger über `supersedesBatchIds` oder alte Einzelvorschläge über `supersedesProposalIds` ersetzen. Alte Einträge bleiben als `superseded` erhalten und verweisen mit `replacedByBatchId` auf den Nachfolger. Akzeptierte Pakete und bestätigte Profile werden nie umgeschrieben. Eine Korrektur daran ist ein neues Paket mit erneuter Kundenbestätigung.
5. **Unklarheiten:** `case.ambiguities` speichert stabile serverseitige IDs, Pfad, optionalen Personenbezug, Frage, ursprüngliche Locale, Nachrichten-/Turn-/Quellenreferenz, Erstellungszeit und `open`/`resolved`. Eine Antwort kann über `resolvesAmbiguityIds` an ein Paket gebunden werden; erst dessen Annahme löst die Unklarheit. Alternativ kann der Kunde sie explizit ohne Datenänderung auflösen. Ein Agent kann sich die Klärung nicht selbst bestätigen.
6. **Bestätigung:** Paketannahme schreibt nur den Entwurf (`draftDirty=true`). Veränderte Betragsfelder werden serverseitig `proposed`, `origin=user`, `review=unreviewed` und erhalten die Quellenreferenz. Erst `engine.confirm(...)` / `POST /confirmations` bestätigt das vollständige Profil, setzt die Betragsfelder auf `confirmed` und erzeugt einen unveränderlichen Snapshot mit neuer `profileVersion`. Andere skalare Angaben haben kein eigenes gespeichertes Confirmation-Flag; `ExtractorContext.fields` leitet ihren Status aus dem Vergleich mit dem letzten bestätigten Profil ab. Bestätigung ist ausschließlich eine ausdrückliche Kundenaktion, keine LLM-Entscheidung und keine Fachprüfung.
7. **Aufteilung/Test:** Valentin übernimmt Verträge, autorisierte Projektionen, Fallmutation, Konflikte, Persistenz, Tests und diese Anleitung. Erni übernimmt Extraktion, Modellaufruf, Prompting, Modelloutput-Validierung und Orchestrierung. Luca zeigt Paketdiff und Bestätigungen an; Dario liefert finalisierte VoiceLogs und spricht Antworten; Lukas nutzt Fortschritt/Playback. Der erste Backend-Durchlauf ist ausführbar (`npm run demo:extraction`). Sobald Ernis Modul ein solches Paket liefert, kann der gemeinsame Test ohne weitere Fallservice-Erweiterung beginnen.

## Gemeinsame Typen und Dateien

Alle Teams importieren aus `@pax/contracts`:

```ts
import {
  VoiceLogSchema, ExtractorContextSchema, ProposalBatchInputSchema,
  ProposalBatchSchema, ProposalAcceptanceSchema, CaseAmbiguitySchema,
  type ExtractorContext, type ProposalBatchInput,
} from '@pax/contracts';
```

- [Gemeinsame Workflow-Schemas](../../../code/packages/contracts/src/proposal-workflow.ts)
- [Vollständiger Fall und Extraktor-Projektion](../../../code/packages/contracts/src/insurance-case.ts)
- [Workflow-Service](../../../code/apps/api/src/insurance/extraction.ts)
- [Pfadfreigaben und Entwurfsänderung](../../../code/apps/api/src/insurance/draft-proposals.ts)
- [HTTP-Controller](../../../code/apps/api/src/insurance/http.ts)
- [Zusammenhängende synthetische JSON-Beispiele](../../../code/fixtures/extraction/)

Die Erweiterungen werden gemeinsam aus demselben Workspace gebaut. Die Fall-Hauptversion bleibt im PoC `1.0`; alte strikte Clients müssen auf die neuen Verträge aktualisiert werden, weil zusätzliche Eigenschaften und der Vorschlagsstatus `superseded` hinzukommen. Ältere verschlüsselte Fälle erhalten beim Öffnen leere `proposalBatches` und `ambiguities`; vorhandene Daten werden nicht gelöscht.

## Reihenfolge eines Gesprächszugs

1. Dario liefert einen validierten, finalen `VoiceLog` mit Fall-, Nachrichten- und Turn-ID. Zwischenresultate bleiben außerhalb des Fallzustands.
2. Erni authentifiziert den serverseitig gehaltenen, fallbezogenen Agent-Grant und lädt **frisch** `ExtractorContext`. `AdvisorContext` bleibt die schlanke Grundlage für Erklärungen und freigegebene Rechenfakten.
3. Erni extrahiert außerhalb einer Speichertransaktion Änderungen oder Unklarheiten. Währung ist CHF, Beträge sind ganzzahlige Rappen; Monat/Jahr werden getrennt erfasst. Unbekannt bleibt `null`, eine vermutete Einheit wird als Unklarheit zurückgegeben. Der LLM-Output ist untrusted input und muss gegen die gemeinsamen Schemas validiert werden.
4. Erni sendet ein Paket mit exakt `expectedCaseRevision`, `expectedProfileVersion` und `basisDraftHash` aus dieser Projektion. Ein während des Modellaufrufs geänderter Fall führt zu einem Konflikt.
5. Der Backend-Service prüft Berechtigung, aktuelle Sitzung, Fallablauf, Identitäten, Pfadfreigaben und den **kombinierten** resultierenden `DraftSchema`. Er speichert das Paket und gegebenenfalls Unklarheiten. Der Entwurf bleibt unverändert. SSE meldet `agent_proposal_batch_available` mit einer neuen `contextRevision`; bei neuen Unklarheiten heißt das Ereignismotiv `agent_ambiguities_available` und signalisiert, eine dadurch ungültige laufende Antwort zu unterbrechen.
6. Luca lädt den Fall neu, zeigt die Änderungen und fragt nach Annahme des ganzen Pakets. Nur der authentifizierte Kunde kann übernehmen. Die HTTP-Antwort enthält die neue Revision, den Entwurf und `confirmationStillRequired=true`.
7. Offene Unklarheiten werden zuerst geklärt. Der Kunde bestätigt danach das vollständige Profil einschließlich Annahmen und synthetischem Rechnertransfer. Erst danach wird neu gerechnet und die Erklärung anhand aktueller Rechenfakten erzeugt.
8. Erni/Dario laden nach Zustandsereignissen den Kontext erneut. Keine bereits generierte Antwort mit älteren Kontext-/Turn-Referenzen ungeprüft weitersprechen.

Ein technischer Backend-Durchlauf testet noch keine wirkliche Gesprächsqualität, keine OpenAI-Anbindung und kein Voice-/Avatar-Zusammenspiel. Diese Module werden beim gemeinsamen Test ergänzt.

## Routen und Service-Methoden

Die API-Basis ist für den lokalen Start `http://127.0.0.1:3000/api`. Für Browserzugriffe gelten weiterhin Cookie plus CSRF; für Ernis Server der fallbezogene Bearer-Grant. Agent-Tokens bleiben serverseitig und werden nicht in URLs, Prompts oder Logs geschrieben.

| Aktion | HTTP relativ zu `/api/cases/:caseId` | Methode im gemeinsamen Runtime | Rolle |
|---|---|---|---|
| Aktueller Extraktionszustand | `GET /advisor/extractor-context` | `extraction.context(actor,id)` | Kunde / fallbezogener Agent |
| Vorschläge und Unklarheiten einreichen | `POST /advisor/proposal-batches` | `extraction.proposeBatch(actor,id,input)` | Agent |
| Paket atomar in Entwurf übernehmen | `POST /advisor/proposal-batches/:batchId/accept` | `extraction.acceptBatch(actor,id,batchId,input)` | Kunde |
| Gesamtprofil bestätigen | `POST /confirmations` | `engine.confirm(actor,id,input)` | Kunde |
| Beratung/Erklärung lesen | `GET /advisor/context` | `engine.advisorContext(actor,id)` | autorisierter Kontextzugriff |
| Änderungen abonnieren | `GET /advisor/events` | bestehender SSE-Controller | autorisierter Kontextzugriff |

Ein Paket nur mit Unklarheiten ist erlaubt, aber nicht als Entwurfsänderung annehmbar (`NO_CHANGES_TO_ACCEPT`). Es dient dazu, Rückfragen sofort nachvollziehbar zu speichern. `questions` und `AdvisorContext.nextQuestion` priorisieren Unklarheiten mit `dialogueStatus=needs_answer`. Ein gültiges Antwortpaket führt zu `awaiting_customer_acceptance` und wird über `pendingAcceptanceBatchIds` zur Annahme angeboten, ohne dieselbe Frage zu wiederholen. Bei einer anderen aktuellen Sprache verwendet die Frageprojektion eine vorhandene lokalisierte Feldfrage; der Originaltext mit seiner Locale bleibt gespeichert. Während Unklarheiten offen sind, sind neue Analysen, Empfehlungen und darauf aufbauende Vertragsaktionen gesperrt; der Gesprächskontext gibt keine Rechenbeträge zum Sprechen frei.

## Paketbeispiel

Die Werte sind erfunden. IDs, Revision und Hash immer aus dem aktuellen Kontext übernehmen; untenstehende Platzhalter sind kein ausführbarer Request.

```json
{
  "messageId": "extraction_attempt_01",
  "source": {
    "messageId": "extraction_attempt_01",
    "turnId": "voice_turn_12",
    "sourceRef": "synthetic:voice_message_12"
  },
  "expectedCaseRevision": 7,
  "expectedProfileVersion": 1,
  "basisDraftHash": "<64-stelliger Hash aus ExtractorContext.draftHash>",
  "changes": [
    { "path": "financial.persons.0.income.value", "personId": "person_demo_1", "value": 8300000 },
    { "path": "insurance.persons.0.grossAnnualIncomeCents", "personId": "person_demo_1", "value": 11900000 }
  ],
  "ambiguities": [],
  "supersedesBatchIds": [],
  "supersedesProposalIds": [],
  "resolvesAmbiguityIds": []
}
```

Das ist ein Paket pro zusammengehöriger Änderung, etwa Netto- und Bruttoeinkommen einer Person. Zwei unabhängig auf derselben Basis erzeugte Pakete werden nicht automatisch zusammengeführt: Die Annahme des ersten kann das zweite veralten lassen. Erni soll zusammenhängende Änderungen deshalb in **einem** Paket einreichen oder nach Annahme erneut extrahieren.

Annahme durch Luca/Kunde:

```json
{ "expectedCaseRevision": 8, "accept": true }
```

Anschließende ausdrückliche Gesamtbestätigung mit der **Revision aus der Annahmeantwort**, nicht einer geratenen Nummer:

```json
{
  "expectedCaseRevision": 9,
  "confirmProfileAndAssumptions": true,
  "allowSyntheticCalculatorTransfer": true,
  "noticeVersion": "lifemap-synthetic-v2"
}
```

Unklarheit ohne Werteänderung auflösen:

```json
{
  "expectedCaseRevision": 10,
  "resolved": true,
  "resolutionSourceRef": "synthetic:customer_clarification_turn_13"
}
```

Bei Antwort durch Feldänderung stattdessen die stabile Unklarheits-ID in `resolvesAmbiguityIds` des neuen Pakets angeben. Zielpfad und Personenbezug müssen zu der Änderung passen. Das Erstellen des Antwortpakets allein löst sie noch nicht.

## Zulässige Schreibziele und leere Fälle

`ExtractorContext.writablePaths` ist die aktuelle Positivliste. Der Backend-Service bleibt maßgeblich, auch wenn ein Modell etwas anderes behauptet.

- Vorhandene Geschäftsattribute, beispielsweise Einkommen und Periodizität, Vorsorgeleistungen, Geburtsjahr, Beschäftigungsgrad, Finanz- und Lebensziele, Schulden und Familienangaben.
- Bei Personenpfaden ist zusätzlich die stabile `personId` erforderlich. Die Indexposition wird nur gemeinsam mit aktuellem Entwurfshash und Profilversion verwendet. Keine Zuordnung aus Namen raten und keine Personen-IDs neu erfinden, wenn sie bereits existieren.
- Neue Datensätze über `goals_add`, `financial.persons_add`, `financial.expenses_add`, `financial.assets_add`, `financial.provisions_add`, `insurance.persons_add`, `insurance.children_add`, `insurance.debts_add`. Das hinzugefügte Objekt muss vollständig zum jeweiligen Schema passen. Identitäten werden im neuen Objekt vergeben und durch Schema-/Referenzprüfungen validiert; bestehende IDs sind nicht über Einzelpfade editierbar.
- Ein leerer Fall kann `financial` und `insurance` jeweils einmal initialisieren, solange der jeweilige Block `null` ist. Dafür müssen vollständige schema-konforme Strukturen mit unbekannten Werten als `null` bereitgestellt werden. Die Initialisierung ist kein Ersatz für das Sammeln der tatsächlichen Angaben und keine Erlaubnis, fehlende Werte zu erfinden. Die Fall-ID wird serverseitig gesetzt; Kundenmodus wird abgewiesen.
- Keine schreibbaren Pfade für Eigentümer, Berechtigungen, Vertragszustände, Provider-Tokens, `review`, `confirmation`, `origin` oder beliebige JSON-Pointer. Neue Betragsobjekte erhalten bei Annahme ebenfalls keine fachliche Prüfbestätigung.
- Das Paket wird auf der gemeinsamen Endstruktur validiert. Fehlende/ungültige Referenzen, Wertebereiche und unbekannte Eigenschaften verhindern die Annahme vollständig. Fachliche Vollständigkeit und zusätzliche Berechnungsregeln werden weiterhin bei Profilbestätigung und Analyse geprüft.

Die aktuelle Positivliste erlaubt keine beliebigen Lösch- oder Neuordnungsoperationen, keinen Rohtext für Gesundheitsangaben und keinen freien Datenspeicher. Bei einer noch nicht unterstützten strukturellen Änderung einen expliziten Vertrag ergänzen, statt Pfadprüfungen zu umgehen.

## Korrektur- und Konfliktregeln

- Mehrere Änderungen in einem Paket teilen sich einen Basis-Hash. Dieser wird vor der Gesamtannahme genau einmal gegen den aktuellen Entwurf geprüft; anschließend werden die Änderungen auf einer Kopie angewendet und zusammen validiert.
- Für gleiche Zielpfade ist eine explizite Ersetzung offener Vorschläge nötig (`SUPERSESSION_REQUIRED`). Wird ein altes Paket ersetzt, müssen alle seine Änderungspfade im Nachfolger enthalten sein (`INCOMPLETE_SUPERSESSION` verhindert stillen Verlust anderer zusammengehöriger Änderungen). Ein angenommenes Paket lässt sich nicht superseden.
- Gleiche `messageId` mit identischem normalisiertem Inhalt liefert dasselbe gespeicherte Paket zurück, auch wenn die Erstellung selbst die Revision erhöht hat. Gleiche ID mit anderem Inhalt führt zu `IDEMPOTENCY_CONFLICT`. Nach bewusst neuer Extraktion ist eine neue Extraktionsnachrichten-ID nötig; die ursprüngliche Voice-Nachricht bleibt über die Quellenreferenz zuordenbar.
- `VERSION_CONFLICT`, `STALE_CONTEXT` oder `STALE_PROPOSAL`: neu laden und sachlich neu auswerten, keine neue Revision auf einen alten Modelloutput kleben. Sessionablauf, Widerruf und Fallbesitz werden erneut geprüft.
- Zweimalige oder konkurrierende Annahme führt zu einer erfolgreichen Mutation und anschließendem Konflikt. Bei verloren gegangener HTTP-Antwort den Fall neu laden und den Paketstatus prüfen, statt den Inhalt als neues Paket nochmals anzuwenden.
- Annahme invalidiert aktiven Lauf, laufende Analyseanforderung und Grafikkontext. Bestätigte Profile und historische Ergebnisse bleiben als Historie erhalten.
- `UNRESOLVED_AMBIGUITIES` bedeutet: offene Rückfragen klären, bevor das Gesamtprofil bestätigt oder erneut beraten wird.

Die früheren Einzelvorschläge (`/advisor/proposals`) gibt es nicht mehr; `supersedesProposalIds` bleibt nur für gespeicherte Altfälle im Vertrag.

## Nest-Anbindung und Verantwortungsgrenze

```ts
@Injectable()
export class ErniDialogService {
  constructor(@Inject(LIFE_RUNTIME) private readonly runtime: LifeRuntime) {}

  async propose(actor: Actor, caseId: string, modelOutput: unknown) {
    const input = ProposalBatchInputSchema.parse(modelOutput);
    return this.runtime.extraction.proposeBatch(actor, caseId, input);
  }
}

// Beim Bootstrap, nachdem ErniDialogModule implementiert wurde:
const { app } = await createLifeInsuranceApp(options, [ErniDialogModule]);
```

Die im Paket vorgeschriebenen Identitäten, Quellenreferenzen und Basisversionen setzt Ernis Orchestrierung aus dem validierten VoiceLog und frisch geladenen Kontext. Das Modell darf diese Werte nicht frei bestimmen. Im selben Prozess kommt `actor` aus `LifeSessionGuard`; ein separater Server verwendet den kurzlebigen Agent-Grant und die HTTP-Routen. Sicherheitsprüfung bleibt auch bei internen Service-Aufrufen aktiv. Ein eigener Erni-Controller benötigt ebenfalls `@UseGuards(LifeSessionGuard)` und darf bestätigende Aktionen nicht als Agent ausführen.

Der globale Runtime-Provider und der zweite Bootstrap-Parameter sind implementiert und über einen kleinen zusätzlichen Nest-Testcontroller auf gleiche Runtime sowie unauthentifizierten Zugriff getestet. Ein konkreter Erni-Dialogcontroller wird hier nicht als bereits vorhanden ausgegeben.

Die neue Projektion ist eine Leseberechtigung für den Fall, **keine externe KI-Transferfreigabe**. `noExternalAiTransferAuthorized=true` bleibt erhalten. Der aktuelle Prototyp verarbeitet ausschließlich explizit synthetische Fälle; reale Kunden-, Finanz- oder Gesundheitsdaten dürfen nicht über einen ungeprüften Modellaufruf übertragen werden. Erni hält Modellschlüssel serverseitig und begrenzt Modellinput auf die tatsächlich benötigten synthetischen Angaben. Der Logik-Service ruft OpenAI nicht auf.

## Persistenz und DB

Die Listen leben im vorhandenen zentralen Fall und werden zusammen mit dem übrigen Fall AES-256-GCM-verschlüsselt gespeichert. Neustart, Ablauf und Löschung gelten damit auch für Pakete und Unklarheiten. Technische Audits enthalten Aktions- und Versionsreferenzen; Frage, Quelle und Änderungshistorie bleiben im geschützten Falldatensatz statt in offenen Konsolenlogs.

Für den Hackathon genügt **ein Backendprozess mit diesem Fallspeicher**. Eine separate Erni-Datenbank würde die gemeinsame Wahrheit und Versionierung erschweren. Mehrere Nest-Instanzen benötigen die später dokumentierte PostgreSQL-/Transaktions-/Event-Migration; sie ist weiterhin nicht implementiert. Lokaler Browser und Loopback-Host bleiben wie bisher, keine neue öffentliche Veröffentlichung.

## Gemeinsamer Abnahmetest

Im Repo-Unterordner `code`:

```sh
npm test
```

Der Ablauf ist in `tests/extraction-workflow.test.mjs` abgedeckt. Er verwendet absichtlich den synthetischen Testprovider, erzeugt temporäre verschlüsselte Speicherung und entfernt sie anschließend. Er benötigt keinen Logismata- oder OpenAI-Schlüssel. Er prüft Paketannahme → vorgeschlagene Beträge → Profilversion 2 → Berechnung auf Version 2. `npm run contracts:extraction-examples` exportiert sechs zusammengehörige Beispiel-JSONs; die IDs daraus existieren nicht im laufenden Server.

Für den ersten gemeinsamen Test ersetzt Erni den simulierten Extraktionsoutput durch sein Modul: „Mein Bruttojahreseinkommen ist 119'000 CHF“, danach eine Korrektur vor Annahme und eine Rückfrage zur Periodizität. Abnahme: richtige Person, ausschließlich jährliches Brutto in Rappen und unverändertes Budget-Netto, explizite Ersetzung, atomare Annahme, Rückfrage bis Kundenantwort offen, anschließende Profilbestätigung, neue Berechnung und aktualisierter Gesprächskontext. Zusätzlich zwei gleichzeitige Browseränderungen testen; keine stille Überschreibung.
