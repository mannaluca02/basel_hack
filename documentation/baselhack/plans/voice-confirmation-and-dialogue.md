# Dario und Erni: gebundene Bestätigungen und beantwortete Unklarheiten

Stand: 31.10.2026. Implementiert im gemeinsamen Logik-Backend. Die echte STT-/TTS-Anbindung und der Angular-Kundenclient werden weiterhin durch die jeweiligen Teammitglieder angeschlossen.

## Festgelegter erster Test

„Mein **Bruttojahreseinkommen** beträgt 119’000 Franken.“

Es wird ausschließlich `insurance.persons.0.grossAnnualIncomeCents` für `person_demo_1` auf `11_900_000` Rappen geändert. Das Budget-Netto bleibt unverändert. Das bisherige Beispiel enthält unter `financial.persons.0.income` ein jährliches Netto nach Einkommenssteuer; es ist kein monatliches Brutto. Eine monatliche Bruttoangabe erfordert eine eigene Klärung der Jahresbasis einschließlich zusätzlicher Monatslöhne. Der Extraktor darf daraus nicht ohne Rückfrage Budget-Netto ableiten.

Die Anbindung erfolgt intern über `LIFE_RUNTIME` oder über dieselben HTTP-Routen bei separatem Modul. Der gemeinsame Fallservice und sein verschlüsselter Store bleiben die einzige Zustandsquelle. Die zusätzlichen Verträge kommen aus `@pax/contracts`.

## Gesprächsstatus einer Unklarheit

Der gespeicherte fachliche Status bleibt `open` oder `resolved`. `ExtractorContext.ambiguities` und `AdvisorContext.ambiguities` enthalten zusätzlich eine **berechnete** Sicht:

| `dialogueStatus` | Bedeutung | Nächster Gesprächsschritt |
|---|---|---|
| `needs_answer` | Keine derzeit gültige vorgeschlagene Antwort | Frage stellen |
| `awaiting_customer_acceptance` | Ein aktuelles offenes Paket beantwortet die Unklarheit | Das Paket zur Annahme anbieten |
| `resolved` | Der Kunde hat die Antwort übernommen oder explizit geklärt | Fortfahren |

`answerBatchId` verweist auf das aktuelle Antwortpaket; sonst ist es `null`. `AdvisorContext.pendingAcceptanceBatchIds` und `QuestionsResponse.pendingAcceptanceBatchIds` liefern die betreffenden Paket-IDs ohne Duplikate.

Der Server berücksichtigt dafür Paketstatus, Personen-/Feldbezug, `resolvesAmbiguityIds`, Entwurfshash und bestätigte Profilversion. Ein nur vorhandenes, bereits veraltetes Paket genügt nicht. Nach Ersetzung gilt das gültige Nachfolgerpaket. Nach Entwurfsänderung oder Ablehnung wird die Sicht neu bewertet. Gespeicherte Unklarheiten werden dabei nicht vorzeitig als gelöst markiert.

Die Frageprojektion unterdrückt dieselbe bereits beantwortete Frage, solange das gültige Antwortpaket auf Annahme wartet. Die fachlich offenen Felder bleiben in `mandatoryFields`, damit Gesamtprofilbestätigung und Beratung weiterhin blockiert sind. Bekannte, bereits angenommene Beträge mit `confirmation=proposed` werden ebenfalls nicht erneut als unbekannt abgefragt: Hier fehlt die Gesamtprofilbestätigung, nicht der Wert.

Dario/Erni prüfen zuerst `pendingAcceptanceBatchIds`, bevor sie aus einem fehlenden `nextQuestion` eine abgeschlossene Beratung ableiten. Wenn nur eine Annahme offen ist, lautet die nächste Aktion „Antwort übernehmen?“ und nicht nochmals die ursprüngliche Frage.

## Zwei getrennte Kundenaktionen

- `accept_batch`: Übernimmt genau das angezeigte Paket in den Entwurf und löst gegebenenfalls die daran gebundenen Unklarheiten. Das Gesamtprofil bleibt unbestätigt.
- `confirm_profile`: Bestätigt das angezeigte Gesamtprofil, die Annahmen und den ausdrücklich genannten Transfer synthetischer Daten zum autorisierten Rechner. Erzeugt eine neue bestätigte Profilversion. Ist blockiert, solange Unklarheiten offen sind.

Ein gesprochenes „Ja“ ist kein allgemeiner Befehl an das LLM. Der Backend-Service erzeugt eine kurzlebige, einmal verwendbare Bestätigungsanforderung für genau eine dieser Aktionen. Der Kunde muss für jede Aktion getrennt antworten.

## Autorisierung und Bindung

Alle neuen Bestätigungsrouten erfordern die **bestehende Kundensitzung**. Im Browser gelten Cookie plus CSRF. Agent- und Reviewer-Token dürfen weder anfordern noch lesen, darstellen lassen, beantworten oder abbrechen. Dario erhält keine Kunden-Zugangsdaten; der Kundenclient vermittelt seine Wiedergabe- und Antwortereignisse.

Eine Anforderung ist gebunden an:

- Fall und konkrete Kundensitzung;
- Zielaktion sowie gegebenenfalls Paket-ID;
- aktuelle Fallrevision, bestätigte Profilversion, Entwurfshash und Zielhash;
- serverseitige `questionId`, erwartete Frage-`turnId` und `replyId`;
- Hash des exakten Fragetextes, der Locale, der Aktion und des vollständigen angezeigten Prüfstands;
- Ablaufzeit von höchstens zwei Minuten, zusätzlich begrenzt durch Sitzung und Fall.

Die Sitzungshash-Bindung und Liste der Bestätigungsanforderungen bleiben privat im verschlüsselten Fall. Sie werden nicht im vollständigen öffentlichen Fall-DTO oder im Extraktor-/Advisor-Kontext ausgegeben. Die dedizierten Kundenrouten liefern nur das gemeinsame `CustomerConfirmationSchema`.

Jede normale Falländerung invalidiert ausstehende Anforderungen. Eine neue Bestätigungsfrage ersetzt die vorherige. Bei einer **anderen neuen Gesprächsfrage oder einem Abbruch** muss Darios Kundenclient die bisherige Anforderung über `/cancel` mit `reason=new_question` abbrechen, bevor er fortfährt. Das Backend kann eine anderweitig gesprochene Frage ohne dieses Ereignis nicht erkennen. Ein verspätetes „Ja“ darf nicht auf eine neue Frage umgebunden werden.

## Endpunkte und interne Methoden

Basis relativ zu `/api/cases/:caseId`:

| HTTP | Methode auf `runtime.confirmations` | Zweck |
|---|---|---|
| `POST /customer-confirmations` | `create(actor,id,input)` | Genau eine Frage und ihren Prüfstand erzeugen |
| `GET /customer-confirmations/current` | `current(actor,id)` | Letzte Anforderung derselben Sitzung nach Reload/Transportfehler laden |
| `GET /customer-confirmations/:confirmationId` | `get(actor,id,confirmationId)` | Bestimmte Anforderung laden |
| `POST /customer-confirmations/:confirmationId/presented` | `presented(actor,id,confirmationId,input)` | Kundenclient bestätigt Anzeige und abgeschlossene Wiedergabe |
| `POST /customer-confirmations/:confirmationId/answer` | `answer(actor,id,confirmationId,input)` | Gebundene finale Antwort prüfen und genau eine Aktion atomar ausführen |
| `POST /customer-confirmations/:confirmationId/cancel` | `cancel(actor,id,confirmationId,input)` | Abbruch/neue Frage melden |

Die vorhandenen direkten Kundenaktionen für Paketannahme und Profilbestätigung bleiben für ausdrücklich betätigte UI-Aktionen verfügbar. Der Sprachpfad verwendet die neue Bestätigungskette. Ein Agent darf diese direkten Aktionen weiterhin nicht ausführen.

## Ablauf für Luca und Dario

### 1. Anforderung erzeugen

Nach frischem Laden des Falls ruft der **Kundenclient** auf:

```ts
const input = {
  expectedCaseRevision: currentCase.caseRevision,
  target: { kind: 'accept_batch', batchId },
  channel: 'voice',
  questionTurnId: 'question_turn_01',
  questionReplyId: 'question_reply_01',
};
```

Die Frage-IDs für Turn/Reply kommen aus eurer Orchestrierung und dürfen nicht für eine andere Bestätigungsanforderung wiederverwendet werden. Der Server erzeugt `questionId`, Fragetext, Hash, Ablaufzeit und eingefrorenen Prüfstand. Die Erstellung erhöht die Fallrevision; für die folgenden Schritte gilt `confirmation.basisCaseRevision` aus der Antwort.

Der Kundenclient zeigt `confirmation.review` an. Für Voice wird **der serverseitige Fragetext** unverändert gesprochen. Er enthält beim ersten Test ausdrücklich Brutto, Jahresbasis, Person und den Betrag. Dieser Bestätigungstext bestätigt Kundeneingaben und ist keine errechnete Leistungsprognose aus `AgentReply.approvedFacts`.

Die Voice-Darstellung von Paketänderungen ist zunächst auf jährliches Brutto sowie Budget-Netto nach Einkommenssteuer mit bekannter Monats-/Jahresbasis begrenzt. Andere strukturierte Änderungen liefern `VOICE_CONFIRMATION_REQUIRES_SCREEN`; sie können über `channel=screen` mit demselben gebundenen Kundenablauf bestätigt werden. Es wird kein beliebiger JSON-Patch als vermeintlich verständliche Voice-Zusammenfassung vorgelesen.

### 2. Anzeige und Wiedergabe bestätigen

Erst der echte TTS-Callback `ended` führt zum Kundenaufruf `/presented`:

```ts
const binding = {
  expectedCaseRevision: confirmation.basisCaseRevision,
  questionId: confirmation.questionId,
  questionHash: confirmation.questionHash,
  questionTurnId: confirmation.questionTurnId,
  questionReplyId: confirmation.questionReplyId,
};

const presentation = {
  ...binding,
  reviewDisplayed: true,
  profileAndAssumptionsDisplayed: false,
  privacyNoticeDisplayed: false,
  playback: { playbackId: actualPlaybackId, event: 'ended' },
};
```

Für `confirm_profile` müssen `profileAndAssumptionsDisplayed` und `privacyNoticeDisplayed` beide `true` sein; der Kundenclient muss diese Inhalte tatsächlich anzeigen. `reviewDisplayed=true` gilt für beide Aktionen. Für Screen wird `playback` weggelassen.

Die Anzeige-/Playback-Bestätigung ist eine Erklärung des authentifizierten Kundenclients. Das Backend kann damit die Protokollreihenfolge prüfen, aber weder echte Lautsprecherwiedergabe noch die Identität einer Stimme nachweisen. Der Client darf den Callback nicht vorwegnehmen und eine TTS-Unterbrechung nicht als `ended` melden.

### 3. Finale Antwort an genau diese Frage binden

Während der Aufnahme wird die aktuelle Frage zugeordnet. Der finale `VoiceLog` erhält **bereits bei seiner Erzeugung** `correlationId=confirmation.questionId`; er wird nicht nachträglich aus irgendeinem früheren „Ja“ zusammengesetzt.

```ts
const answer = {
  ...binding,
  channel: 'voice',
  voiceLog: {
    schemaVersion: '1.0',
    messageId: freshAnswerMessageId,
    caseId,
    correlationId: confirmation.questionId,
    turnId: freshAnswerTurnId,
    source: 'voice',
    locale: confirmation.locale,
    text: 'Ja.',
    transcriptStatus: 'final',
    dataClassification: 'synthetic',
    expectedCaseRevision: confirmation.basisCaseRevision,
  },
};
```

Der Backend-Service akzeptiert nur eindeutige finale Antworten der passenden Sprache: `ja/nein`, `oui/non`, `sì/no` (auch `si`) und `yes/no`. Mehrdeutige Aussagen wie „Ja, aber …“ lösen keine Mutation aus. Eine neue Rückfrage verwendet anschließend einen neuen Fragevorgang.

Bei Annahme werden Verbrauch der Anforderung, Paketmutation beziehungsweise Profilbestätigung und technischer Audit in **derselben** Speichertransaktion geschrieben. Konkurrenz, Replay oder Fehler erzeugen keine Teilannahme. Ein bereits verwendeter Antwort-`messageId` kann auch die zweite Aktion nicht autorisieren. Bei Antwortverlust den aktuellen Anforderungs-/Fallzustand laden, statt einen alten VoiceLog neu zu etikettieren.

Ein eindeutiges „Nein“ nimmt keine Werte in den Entwurf auf. Bei Paketannahme wird das Paket als `rejected` erhalten; es ist keine weiterhin offene Annahme. Offene Unklarheiten werden dadurch nicht gelöst. Eine neue korrigierte Antwort braucht ein neues Paket. Abbruch ohne Antwort über `/cancel` lehnt dagegen das Paket nicht ab.

### 4. Gesamtprofil separat bestätigen

Nach erfolgreicher Paketannahme zeigt Luca das neue Gesamtprofil. Danach erzeugt er eine neue Anforderung mit `target: { kind: 'confirm_profile' }`, neuen Frage-Turn-/Reply-IDs und aktueller Fallrevision. Es folgt erneut Anzeige, gegebenenfalls TTS-`ended` und eine **neue** Antwort. Erst danach wird gerechnet.

## Verträge, Beispiele und Test

- [Gemeinsame Bestätigungsverträge](../../../code/packages/contracts/src/customer-confirmation.ts)
- [Bestätigungsservice](../../../code/apps/api/src/insurance/customer-confirmations.ts)
- [Berechneter Rückfragenstatus](../../../code/apps/api/src/insurance/ambiguity-dialogue.ts)
- [Browser-/Team-Beispiele](../../../code/examples/contracts/team-client.ts)
- [Zusammenhängende Voice-JSONs](../../../code/fixtures/voice-confirmation/)
- [Tests](../../../code/tests/customer-confirmations.test.mjs)

Im `code`-Workspace:

```sh
npm test
```

`tests/customer-confirmations.test.mjs` verwendet temporäre verschlüsselte Speicherung und den synthetischen Testprovider. Er simuliert zwei finale Antworten, ruft aber weder OpenAI noch echte Spracherkennung, TTS oder Live-Logismata auf. Er prüft: nur jährliches Brutto geändert → Budget-Netto unverändert → beantwortete Frage nicht wiederholt → erstes Ja übernimmt Paket → zweites Ja bestätigt Profilversion 2 → Berechnung auf Version 2.

`fixtures/voice-confirmation` enthält acht eingefrorene Vertragsbeispiele und einen Ergebnisnachweis. Die IDs sind Offline-Beispiele, keine laufenden Serverfälle. Bestätigungsfragen in diesen Dateien sind beim späteren Lesen abgelaufen und werden im echten Ablauf immer neu erzeugt.

Die neuen Context-Felder und der Paketstatus `rejected` erfordern, dass alle Teams denselben aktuellen Stand von `@pax/contracts` bauen. Bestehende verschlüsselte Fälle erhalten beim Öffnen eine leere private Liste der Bestätigungsanforderungen. Es wird keine weitere Datenbank eingerichtet.

## OpenAI-Grenze

`ExtractorContextSchema` bleibt der verbindliche Eingang für Ernis Orchestrierung, aber kein automatischer vollständiger Modellpayload. Die bestehende Policy `noExternalAiTransferAuthorized=true` bleibt unverändert. Diese Erweiterung führt keine externe KI-Transferfreigabe und keinen Modellaufruf ein. Ein tatsächlicher Anschluss muss weiterhin einen ausdrücklich synthetischen, minimalen Modellinput, serverseitige Schlüssel und den passenden Verarbeitungshinweis vorsehen. Reale Kunden-/Gesundheitsdaten sind nicht für diese Demo freigegeben.

Für den tatsächlichen Voice-Anschluss gibt es inzwischen das [separate Nest-Voice-Modul](voice-backend-integration.md) mit eigener synthetischer Voice-Zustimmung. Die hier beschriebenen Bestätigungsbindungen und die Beschränkung des vollständigen Extraktionskontexts gelten weiterhin.
