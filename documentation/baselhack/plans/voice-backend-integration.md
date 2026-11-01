# Voice mit Valentins Fall-Backend verbinden

Stand: 31.10.2026. Backend-Implementierung auf `feat/voice-case-integration`; Ausgangspunkt `2ae587c` von `main`. Der separate Express-Server aus `feature/voice` wird für diese Anbindung nicht benötigt. Darios Browser-Client und Ernis Extraktor können unabhängig auf die hier beschriebenen Verträge wechseln.

## Zuständigkeiten und Ergebnis

| Person | Übergabepunkt |
|---|---|
| Valentin | Nest-Voice-Modul, authentifizierte Fallbindung, Provideradapter, verschlüsselte finale Transkripte, Feldmapping, atomare Vorschlagspakete, Versionierung und Lifecycle |
| Dario | WebRTC/ElevenLabs-Client, Mikrofon und Wiedergabe, Callback-IDs, finalisierte Transkripte, dynamische Gesprächsaktualisierung, Sprachwechsel und unmittelbarer Medienabbruch |
| Erni | Extraktion der Beobachtungen, Bedeutung/Einheiten prüfen, explizite Personenreferenzen, Unklarheiten/Korrekturen und Tool-Orchestrierung; kein zweiter autonom schreibender Fallzustand |
| Luca | Angular-Falladapter, Zustimmung zur synthetischen Sprachdemo, Review/Bestätigungen und Berateransicht |
| Lukas | Avatar folgt dem gemeinsamen Fortschritt, echten Playback-Ereignissen und dem Stoppsignal |

Implementierung: [VoiceModule](../../../code/apps/api/src/voice/module.ts), [Service](../../../code/apps/api/src/voice/service.ts), [Provideradapter](../../../code/apps/api/src/voice/providers.ts), [Mapping](../../../code/apps/api/src/voice/portfolio.ts), [gemeinsame Verträge](../../../code/packages/contracts/src/voice-integration.ts). Es gibt keine neue Datenbank und keine neue npm-Abhängigkeit. Die vorhandene verschlüsselte Fallablage bleibt maßgeblich.

## Schnell testen

Ab Repository-Wurzel:

```sh
npm --prefix code ci
npm --prefix code test
npm --prefix code run demo:voice-integration
```

Die Demo verwendet einen Fake-Voice-Gateway und den synthetischen Rechner, eine temporäre verschlüsselte Ablage und simulierte Playback-Ereignisse. Sie öffnet weder Mikrofon noch Providerverbindung. Ablauf: finales Kundentranskript → quellengebundene Beobachtung → Vorschlag → zwei getrennte Bestätigungen → Berechnung mit Profilversion 2 → Beraterübergabe. Jahresbrutto wird `11900000` Cent; Budget-Netto und zusätzliche Sparrate bleiben unverändert.

[Zusammenhängende JSON-Beispiele](../../../code/fixtures/voice-integration/) enthalten Session-Metadaten, Transkript, Extraktionsrequest, Paket, beide Bestätigungen, Übergabe und Ergebnis. Mit `npm --prefix code run contracts:voice-integration-examples` neu erzeugen. IDs und Zeitstempel sind Offline-Beispiele; für echte Requests neue Fälle, Sitzungen und Bestätigungen erzeugen.

## Lokalen Server konfigurieren

`npm --prefix code start` liest die gitignorierte Root-`.env`, die auch den Logismata-Token enthält. Werte in der bereits gesetzten Prozessumgebung haben Vorrang. Beispielnamen stehen in [`.env.example`](../../../.env.example):

```dotenv
PAX_SYNTHETIC_VOICE_ENABLED=1
OPENAI_API_KEY=
LIVE_MODEL=gpt-live-1
LIVE_VOICE=juni
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
```

Für ElevenLabs einen vorhandenen Agenten mit passenden Demo-Anweisungen, freigegebenen Sprachen und erlaubtem Prompt-Override konfigurieren. Das Backend erstellt oder verändert keine Agenten. Der Browser muss den zurückgegebenen `prompt` und die aktuelle Sprache bei `startSession` übergeben; der Token-Endpunkt konfiguriert den Agenten selbst nicht. OpenAI erhält den initialen Prompt serverseitig beim Aufbau.

Ohne explizites Enable-Flag bleiben beide Provider deaktiviert. `GET /api/voice/providers` zeigt die lokale Konfiguration; das ist kein Provider-Gesundheitscheck. Das Starten des Servers löst keine neue Voice-Providerverbindung aus. Wiederherstellung kann verbliebene Provider-Sessions aus der verschlüsselten Ablage beenden.

`POST /api/sessions` erzeugt wie bisher eine Kundensitzung. Zugriffscodes bleiben in der geschützten lokalen Datei `code/.local/lifemap/access-codes.json`. Angular verwendet den HttpOnly-Cookie und `X-CSRF-Token`; Erni verwendet ausschließlich serverseitig den fallgebundenen Agent-Grant aus `POST /api/cases/:caseId/agent-access`. Den Grant weder ins Modell noch ins Frontend geben.

## Routen und Methoden

Alle Fallrouten beginnen mit `/api/cases/:caseId/voice/sessions`.

| Methode / Pfad | Berechtigung | Ergebnis / interner Aufruf |
|---|---|---|
| `GET /api/voice/providers` | öffentlich | verfügbare Provider, keine Schlüssel |
| `GET /api/voice/privacy?locale=de` | öffentlich | eigener Verarbeitungshinweis, DE/FR/IT/EN |
| `GET /api/voice/portfolio` | öffentlich | explizite Behandlung aller 37 Intake-Felder |
| `GET` Session-Basispfad | Kunde / Fall-Agent | `voice.list(actor, caseId)`; Metadaten |
| `POST` Session-Basispfad | Kunde + CSRF | `voice.start(actor, caseId, input)`; kurzlebige Verbindungsdaten |
| `GET /:voiceSessionId/transcript` | Kunde / Fall-Agent | `voice.transcript(actor, caseId, sessionId)`; finale Turns |
| `POST /:voiceSessionId/turns` | Kunde + CSRF | `voice.ingest(actor, caseId, sessionId, input)` |
| `POST /:voiceSessionId/extraction` | nur Fall-Agent | `voice.propose(actor, caseId, sessionId, input)`; Paket oder explizite Folgeaufgaben |
| `POST /:voiceSessionId/close` | Kunde + CSRF | `voice.close(actor, caseId, sessionId, {reason})` |

Erni kann in einem Nest-Feature-Modul `LIFE_RUNTIME` injizieren und diese Methoden direkt nutzen. `LifeSessionGuard` liefert den authentifizierten Actor; keine Actor-Objekte aus Request-Bodies übernehmen. Separate Prozesse verwenden dieselben HTTP-Verträge. Die Spezifikation steht unter `GET /api/openapi.json`; Zod-Typen kommen aus `@pax/contracts`, JSON-Schemas aus `code/packages/contracts/schemas/`. [Browser-/Server-Beispiele](../../../code/examples/contracts/team-client.ts) werden mit reinen DOM-Typen geprüft.

## Dario: Session und Transkripte

Vor dem Start den Hinweis anzeigen, synthetische Daten ausdrücklich bestätigen lassen und dann z.B. senden:

```json
{
  "messageId": "voice_start_01",
  "expectedCaseRevision": 3,
  "provider": "gpt-live",
  "locale": "de",
  "dataClassification": "synthetic",
  "noticeVersion": "voice-synthetic-v1",
  "allowExternalVoiceProcessing": true,
  "sdp": "v=...WebRTC offer..."
}
```

Die Revision und Sprache müssen zum aktuellen Fall passen. Für ElevenLabs `provider: "elevenlabs"` verwenden und SDP weglassen. Antwort: `voiceSession` plus providerabhängige `connection` und `prompt`. Bei OpenAI die Answer-SDP an den vorhandenen Peer übergeben; bei ElevenLabs das kurzlebige Token am SDK verwenden. Verbindungsdaten weder loggen noch speichern. Der Server erlaubt damit 30 Sekunden lang identische Netzwerk-Wiederholungen; die Speicherbereinigung erfolgt spätestens beim folgenden 5-Sekunden-Sweep; sie landen nicht in der Fallablage. Nach Ablauf/Prozessneustart mit neuer `messageId` neu beginnen; niemals eine fehlgeschlagene Session blind wiederholen.

Jeden **finalen** Turn genau einmal übermitteln, Wiederholungen behalten dieselbe `messageId`:

```json
{
  "speaker": "customer",
  "log": {
    "schemaVersion": "1.0",
    "messageId": "customer_income_01",
    "caseId": "CURRENT_CASE_ID",
    "correlationId": "conversation_01",
    "turnId": "income_turn_01",
    "source": "voice",
    "locale": "de",
    "text": "Mein Bruttojahreseinkommen beträgt 119000 CHF.",
    "transcriptStatus": "final",
    "dataClassification": "synthetic"
  }
}
```

Agententurns mit `speaker: "agent"` erfassen. Sie dürfen keine Kundenangaben begründen. Zwischenstände und ein verändertes Transkript unter derselben Message-ID werden abgelehnt. Das Backend erzeugt `transcriptRevision`, `receivedAt` und technische Audit-Ereignisse. Eine Transkriptannahme bestätigt keine Finanzangabe und erhöht nur `contextRevision`; dadurch macht das finale „Ja“ seine noch offene Bestätigungsfrage nicht selbst ungültig.

## Erni: Beobachtungen → gemeinsamer Fall

1. Aktuellen `ExtractorContextSchema` über `/advisor/extractor-context` lesen. Er ist der verbindliche Eingang in die lokale Orchestrierung und enthält Personen-IDs, Feldwerte, offene Pakete, Unklarheiten, Profilversion, Fallrevision und `draftHash`.
2. Finales Kundentranskript und `transcriptRevision` über die Voice-Session lesen. Nur solche Kunden-Turns extrahieren; keine Agentenaussagen als Fakten behandeln.
3. `VoiceExtractionInputSchema` senden. Für eine genau bestätigte Jahresbruttoangabe:

```json
{
  "messageId": "extract_income_01",
  "expectedCaseRevision": 3,
  "expectedProfileVersion": 1,
  "basisDraftHash": "CURRENT_64_CHARACTER_DRAFT_HASH",
  "transcriptRevision": 1,
  "observations": [{
    "fieldId": "annual_gross_income_chf",
    "personId": "person_demo_1",
    "sourceMessageId": "customer_income_01",
    "quote": "119000",
    "value": 119000,
    "precision": "exact",
    "unit": "CHF",
    "period": "year",
    "basis": "gross"
  }]
}
```

Die Platzhalter durch aktuelle IDs/Hash ersetzen. Das Backend verlangt einen vorhandenen finalen Kundenturn und einen darin vorkommenden Belegtext. Es prüft nicht semantisch, ob das extrahierte Zahlenverständnis korrekt ist: Das ist Ernis Aufgabe; deswegen bleiben Review und Kundenbestätigung zwingend. Bei „circa“, Bandbreiten oder fehlender Jahres-/Bruttoangabe `precision` entsprechend setzen; keine Mittelwerte und keine Hochrechnung erfinden.

Die Antwort enthält `mappingVersion: "voice-portfolio-v1"`, `proposalBatch`, `issues`, aktuelle Revisionen und `confirmationStillRequired: true`. Alle Änderungen/Unklarheiten und die Verknüpfung zum Voice-Paket werden in **einer** Store-Transaktion gespeichert. Ein ungültiger Teil führt zu keinem Teilpaket. Die serverseitige Auditbasis bewahrt verarbeitete Beobachtungen (ohne Name/Raucherstatus), Transkriptrevision und Mappingversion verschlüsselt auf; Schlüssel und SDP werden nicht persistiert.

`supersedesBatchIds`, `supersedesProposalIds` und `resolvesAmbiguityIds` sind dieselben Mechanismen wie im normalen Extraktorvertrag. Korrigiert ein Kunde einen noch unangenommenen Vorschlag, das alte Paket ausdrücklich ersetzen und alle zusammengehörigen Felder abdecken. Für bereits bestätigte Angaben entsteht ein neuer Vorschlag mit erneutem Review. Bei `VERSION_CONFLICT`/`STALE_CONTEXT` zuerst Kontext und Transkript neu lesen und erneut beurteilen. Idempotente identische Requests liefern den gegenwärtigen Paketstatus, keine erneute Mutation.

### Feldzuordnung und strukturierte Antworten

Alle 37 Felder werden explizit berücksichtigt:

| Behandlung | Felder |
|---|---|
| 13 direkt als Vorschlag | Geburtsdatum → Geburtsjahr, Provider-Geschlecht, Zivilstand, Beziehungsjahr, Partner-Geburtsjahr, beide Jahresbruttoeinkommen, Arbeitspensum, Pensionskasse vorhanden, bestehende jährliche 3a-Einzahlung, monatliche Wohnkosten, gewünschtes Arbeitsende, explizite Risikoneigung |
| 1 Standort-Lookup | Postleitzahl: vorhandenes `/locations` verwenden, echte `LocationID` auswählen; nie eine Steuer-ID aus der PLZ erfinden |
| 13 strukturierte Erfassung | Kinderanzahl/-jahrgänge, erwartetes Kind, Erwerbsform, Beruf, erstes Schweizer Arbeitsjahr, 3a vorhanden, bestehende Lebensversicherung, freie Vermögenswerte, Wohnform, Schulden, Ziele und Hauskaufjahr |
| 8 menschliche Suitability-Prüfung | Einkommens-/Vermögens-/Spar-/Einmalanlageklassen, Anlageziel, Horizont, Wertschriftenerfahrung und Verlustreaktion |
| 2 in dieser Demo nicht erheben | Vollständiger Name und Raucherstatus |

`issues` dürfen nicht ignoriert oder als vollständig erfasst gezählt werden. Strukturierte Fälle gehen über den bestehenden `ProposalBatchInputSchema`-Weg mit fachlich vollständigen Objekten/Personenreferenzen, die laut `writablePaths` erlaubt sind. Beispiel: Bei Vermögen braucht es neben Betrag auch Zuordnung/Liquidität; ein einzelner CHF-Wert darf keine vorhandenen Konten überschreiben. `TARGET_MISSING` bedeutet zunächst strukturierte Initialisierung/Erfassung, z.B. wenn noch kein Personen-/Wohnkostenobjekt existiert. Nicht vom Schema repräsentierte Beruf-/Arbeitsjahres-/Health-Angaben werden nicht in beliebige Textfelder geschrieben; erforderlichenfalls an einen Berater übergeben.

- Geld am Voice-Rand: CHF mit maximal zwei Dezimalstellen; auf dem gemeinsamen Fall: sichere ganzzahlige **Cent**.
- `annual_gross_income_chf` → `insurance.persons[personId].grossAnnualIncomeCents`; Budget-Netto bleibt unverändert.
- `pillar_3a_annual_contribution_chf` → `insurance.existingAnnualPillar3aContributionCents`; **nicht** `annualSavingCents` (zusätzliche Sparrate).
- Prozent → Basispunkte. Stabile `personId` statt Annahmen über Array-Position 0/1.
- Scheidung/Verwitwung werden nicht auf „ledig“ reduziert. Provider-Geschlecht benötigt einen expliziten erlaubten Wert und wird nicht aus Name/Stimme abgeleitet.

## Gespräch dynamisch aktualisieren und bestätigen

Dario/Erni abonnieren `/api/cases/:caseId/advisor/events`; der Stream bleibt fallgebunden. `advisor.context.updated` kann `voiceSessionId` enthalten. Der Stream ist eine Änderungsbenachrichtigung, kein verlässliches Turn-Queue-Protokoll: Bei jeder Änderung und jedem Reconnect aktuellen Kontext/Sessionliste lesen, Transkripte anhand ihrer Revision/Message-IDs deduplizieren. Mehrere Änderungen können in einem Poll zusammenfallen.

Vor der nächsten Antwort `AdvisorContext` und bei Bedarf `ExtractorContext` aktualisieren. Auch bei gleicher Anzahl bekannter Felder können Werte korrigiert worden sein. Für Prompt-Updates einen Fingerprint aus **Werten und Status** der erlaubten Gesprächsprojektion bilden: Sprache, Personenreferenzen, relevante Felder, offene Vorschläge/Unklarheiten, aktueller Graph/Quellen und Handover-Revision. Nur die Anzahl offener Fragen zu vergleichen reicht nicht. Nicht allein `contextRevision` als Prompt-Änderung verwenden: Ein neuer Agententurn erzeugt selbst ein Event und darf keine endlose Prompt-/Turn-Schleife starten.

Der vollständige Extraktionskontext bleibt lokal; er ist keine pauschale Modelltransferfreigabe. Nur minimal benötigte, ausdrücklich synthetische und vom jeweiligen Verarbeitungshinweis gedeckte Teile ans Modell senden. Bei offenem Stoppsignal keine neue Modell-/Sprachanfrage beginnen.

Für Unklarheiten `dialogueStatus` lesen: `needs_answer` fragen, `awaiting_customer_acceptance` das vorhandene Paket reviewen, `resolved` weitergehen. Die persistierte Unklarheit wird erst durch Kundenaktion aufgelöst. So wird dieselbe bereits beantwortete Frage nicht wiederholt.

Die bestehenden [gebundenen Bestätigungen](voice-confirmation-and-dialogue.md) bleiben maßgeblich: `accept_batch` ändert nur den Entwurf, `confirm_profile` ist eine zweite, separate Aktion. Der Kundenclient fordert die jeweilige Frage an, zeigt deren Review an und meldet erst nach echter vollständiger Wiedergabe `presented`. Erst danach die genau gebundene finale Antwort senden. Ein Agententurn zur Frage verwendet die zurückgegebene `questionReplyId` als `log.messageId`; eine neue andere Frage invalidiert eine offene Bestätigung. Schließen/Wechseln einer aktiven Sprachsession invalidiert deren offene Sprachbestätigung ebenfalls. Fehlt ein verlässlicher Playback-Abschluss, Bildschirmbestätigung verwenden; die 600-ms-Lautstärkeheuristik ist kein Nachweis.

## Handover, Wechsel und Speicher

- Menschlichen Berater über `/handover` anfordern. Innerhalb derselben Falltransaktion werden aktive/aufbauende Voice-Sessions als `interrupted / human_handover` markiert. Das vorhandene unmittelbare SSE-Stoppsignal gilt für Voice, Avatar, KI und Grafik.
- Der Browser überwacht auch `expiresAt` und stoppt Mikrofon, Wiedergabe, Peer und SDK **sofort** bei Ablauf oder Stopp, unabhängig vom HTTP-Ergebnis. Erst danach/begleitend die Serverbenachrichtigung absetzen. Der Server hat keinen Zugriff auf die Mikrofontracks im Browser.
- Bei normalem Voice-Ende `close` mit `customer_closed` oder `inactive`; bei Provider-/Sprachwechsel `voice_switch`. Dieser Status fordert **keinen** menschlichen Berater an. Für eine Nachfolgesession `resumeFrom` setzen; parallele aktive Sessions sind sonst gesperrt. Ein Locale-Wechsel stoppt die bisherige Session beim nächsten Sweep (spätestens ca. 5 Sekunden); der Client stoppt sofort.
- OpenAI erhält einen serverseitigen Hangup-Versuch. `remoteStop: requested` bedeutet, dass der Provider die Anfrage angenommen hat; es ist kein Beweis eines empfangenen `session.closed`-Ereignisses. Fehler werden als `failed` sichtbar. ElevenLabs liefert `client_required`; Dario muss `endSession()` ausführen. Es wird kein unbestätigter ElevenLabs-Hangup-Endpunkt erfunden.
- Logout und Falllöschung über HTTP stoßen die Bereinigung sofort an. Ablaufprüfung läuft alle 5 Sekunden. Prozessneustart setzt verwaiste aktive Sessions auf `server_restart`; Shutdown beendet sie ebenfalls. Remote-Abbruchversuche dürfen den lokalen Stopp nicht blockieren.
- Voice-Sessions maximal 30 Minuten und nie länger als Kunden-/Fallablauf; höchstens 20 pro Fall, 250 finale Turns/500.000 Zeichen pro Session, 100 Extraktionspakete. Die vorhandene Fall-/Audit-Retention und Speicherobergrenze bleiben wirksam.
- Transkripte liegen ausschließlich in der vorhandenen AES-GCM-Fallablage, nicht als neue JSON-Dateien unter `data/conversations`. Öffentliche Fall-DTOs enthalten keine privaten Voice-Transkripte. Die getrennten Voice-Routen sind owner-/fallgebunden; Reviewer erhalten keinen Voice-Transkriptzugriff. Ein relationaler DB-Wechsel bleibt eine spätere Infrastrukturentscheidung.

## Freigabegrenzen und Provider-Nachweise

Diese Integration ist für **erfundene Daten** freigegeben. Eine Session verlangt eine zusätzliche explizite Zustimmung zum ausgewählten Sprachprovider. `/api/privacy` ergänzt bei aktiviertem Voice-Modul die externen Empfänger und den gesonderten Hinweis in allen vier Sprachen. Kalkulatorfreigabe und Profilbestätigung sind davon getrennt. Die bestehende `noExternalAiTransferAuthorized`-Policy des vollständigen Fallkontexts bleibt bestehen. Ein Voice-Consent ist insbesondere keine Freigabe für Ernis OpenAI-Extraktor. Dessen minimaler Modellpayload hat einen eigenen [Verarbeitungshinweis mit hashgebundener Zustimmung](../../compliance.md#drei-getrennte-einwilligungen); Erni prüft vor jedem Modellaufruf `runtime.modelExtraction.assertTransferAllowed()`.

Es gibt keine automatische Wahl einer Telefonnummer, Terminbuchung, Agent-Erstellung, echte Police oder produktive Kundenfreigabe. Reale Kunden-/Gesundheitsdaten und Produktionsbetrieb benötigen die Pax-seitigen Freigaben und Integrationen.

Die echten REST-Adapter sind anhand offizieller Dokumentation geprüft und mit simuliertem `fetch` getestet. Es wurden für diese Änderung keine kostenpflichtigen Live-Voice-Sessions geöffnet; tatsächliche Mikrofon-/Provider-/Avatar-Tests folgen mit Dario nach Client-Anbindung.

Offizielle Referenzen, am 31.10.2026 geprüft:

- [OpenAI: Live-Session erzeugen](https://developers.openai.com/api/reference/resources/live/methods/create): serverseitiges WebRTC-Signaling.
- [OpenAI: Live-Sessions verwalten](https://developers.openai.com/api/docs/guides/live-conversations): expliziter Session-Lifecycle.
- [OpenAI: Session-Hangup](https://developers.openai.com/api/reference/typescript/resources/live/subresources/sessions): serverseitige Beendigungsanforderung.
- [ElevenLabs: WebRTC-Token](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token): Token für vorhandenen Agenten.
