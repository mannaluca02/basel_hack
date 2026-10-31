# Synthetischer Jahresbrutto-Turn

Das optionale Nest-Modul verwendet ausschließlich `LIFE_RUNTIME`, dessen Authentifizierung, `extraction.context()` und `extraction.proposeBatch()`. Es legt keine eigene Fallhaltung an und übernimmt oder bestätigt keine Angaben.

```ts
createLifeInsuranceApp(options, [ErniDialogModule.register({ transport })]);
```

`transport(request, signal)` ist die einzige austauschbare externe Grenze. Die automatisierten Tests simulieren sie. `ErniDialogModule` ohne Registrierung besitzt keinen aktiven Modelltransport. `openAiResponsesTransport(serverSideApiKey)` stellt denselben Responses-Aufruf für den separat gestarteten synthetischen Modelltest bereit. Der Server verwendet `gpt-5.6-terra` und einen endlichen Timeout von 15 Sekunden.

Schnittstelle und Modell-ID wurden am 31.10.2026 anhand der offiziellen Dokumentation zu [Function Calling](https://developers.openai.com/api/docs/guides/function-calling) und [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) geprüft. Die tatsächliche Verfügbarkeit im verwendeten OpenAI-Konto und die Extraktionsqualität sind erst Gegenstand von Ticket 10.

Vor einem Turn liefert `GET /api/erni-dialog/processing-notice` den Hinweis zu OpenAI, ausdrücklich erfundenen Inhalten und dem Extraktionszweck. Der Aufrufer muss dessen `version` als `processingNoticeVersion` mitsenden. Zusätzlich gilt das gemeinsame Gate aus Ticket 02: Die Runtime muss `modelExtraction.enabled=true` haben, und der Kunde muss dem aktuellen Hinweis aus `GET /api/extraction/privacy` mit dessen `noticeHash` separat zustimmen. `runtime.modelExtraction.assertTransferAllowed()` prüft dies unmittelbar vor dem Modellaufruf und erneut vor der Einreichung. Widerruf während der Generierung verwirft die Ausgabe. Der begrenzte Modulhinweis ersetzt diese Zustimmung nicht. `noExternalAiTransferAuthorized=true` bleibt erhalten.

`POST /api/cases/:caseId/erni-dialog/turns` verlangt einen authentifizierten, an diesen Fall gebundenen Advisor. Der Body enthält `demoTurnId`, `processingNoticeVersion`, einen unveränderten strikten `VoiceLog` und einen separaten `conversation`-Ausschnitt mit `role` und `text`. Finale Beiträge mit `source=text` und `source=voice` laufen durch dieselbe Methode `ErniDialogService.turn()`; partielle Transkripte und Audio sind kein gültiger Eingang.

Die künstliche Herkunft wird durch den serverseitig verfassten `DEMO_TURNS`-Katalog begrenzt: Text und Rollen des Eingangs müssen exakt zum ausgewählten Beispiel passen. Das ist kein allgemeiner Eingang für beliebige als `synthetic` markierte Kundengespräche. Der Katalog ordnet den Sprecher ausdrücklich `person_demo_1` zu; diese Zuordnung ist keine frei wählbare HTTP-Eigenschaft. Nur diese Person, ihr erlaubter Jahresbruttopfad und ihr serverseitiger Demo-Ausgangswert von 12’000’000 Rappen erreichen das Modell. Der Wert und der Personenbezug werden gegen den frischen Fallkontext geprüft. Andere oder bearbeitete relevante Ausgangswerte werden vor dem Transport zurückgewiesen. Andere Personen und Fallfelder werden nicht übertragen; das Tool erlaubt für diesen Turn ausschließlich die Sprecherperson. Die Beispiele setzen den bereits vorhandenen vorbereiteten synthetischen Fall voraus.

Der Katalog enthält den Pflichtfall `annual-gross` sowie `smalltalk` und `assistant-example`. Der echte Modelltransport muss selbst Vorschläge über genau `submit_intake_proposals` erzeugen. Der Server gibt den extrahierten Pflichtwert nicht vor. Er bindet aktuelle Pfade und stabile Personen-IDs, prüft den Output und ergänzt Quelle, Revision, Profilversion und Entwurfshash erst außerhalb des Modells. Ein leeres Ergebnis ist nur für `smalltalk` und `assistant-example` ein Erfolg mit `batch: null`; diese beiden Beiträge dürfen auch bei Wiederzustellung niemals eine Änderung erzeugen. Beim ausdrücklich genannten Jahresbrutto führt fehlender Aufnahmeinhalt zu `INVALID_MODEL_OUTPUT`, damit eine unvollständige Extraktion nicht als erfolgreicher leerer Turn gilt. Es wird kein leeres Paket gespeichert.

## Wiederzustellung, Versionen und Stopp

Turns werden je Fall innerhalb der vorhandenen Nest-Instanz sequenziell verarbeitet. Die Herkunfts- und Hinweisprüfung gilt auch für Wiederzustellungen. Ein bereits gespeichertes Paket mit identischer Nachrichten-ID und identischem Eingang wird ohne erneuten Modellaufruf zurückgegeben, auch nach einem Modulneustart. Dafür enthält die serverseitige Quellenreferenz einen Hash des validierten Eingangs. Anderer Inhalt unter derselben ID führt zu `IDEMPOTENCY_CONFLICT`. Leere oder fehlgeschlagene Turns speichern keine zusätzliche Wiederholungsdatenbank.

Ändert sich der Fall während des Modellaufrufs, wird dessen Ausgabe mit `VERSION_CONFLICT` verworfen; der Code setzt keine neueren Revisionen auf alten Output. Eine bewusste Neuauswertung muss den aktuellen Kontext berücksichtigen. Diese erste Scheibe führt keine automatische Neuauswertung aus.

Der Modellaufruf ist an die vorhandenen `digitalTasks` gekoppelt. Handover und Runtime-Abschluss brechen ihn ab; auch ein Transport, der Abort ignoriert, kann nach dem Abbruch keine Ergebnisse speichern. Die Übergaberevision schützt außerdem wartende Turns und den schnellen Wechsel `request → resume`. Während aktiver Übergabe startet kein Modellaufruf. Nach 15 Sekunden folgt `MODEL_TIMEOUT`, ohne Vorschlags- oder Entwurfsänderung. Ein späterer Transportoutput wird verworfen.

## Direkt ausführbarer Test

Im `code`-Verzeichnis mit Node **22 bis 24** und den vorhandenen Backend-Abhängigkeiten:

```sh
npm run demo:erni-dialog
```

Der Lauf initialisiert das tatsächliche Nest-Modul mit zentraler Runtime, synthetischem Rechner-Testprovider und temporärem verschlüsseltem Store. Er simuliert ausschließlich den Modelltransport, benötigt keinen Listener, Schlüssel oder Netzwerkzugriff und entfernt den temporären Store anschließend. Assertions prüfen genau einen unbestätigten Vorschlag über **11’900’000 Rappen**, unveränderten Entwurf einschließlich Budget-Netto und bestätigter Historie sowie idempotente Wiederzustellung ohne zweiten Modellaufruf. Es werden weder Paketannahme noch Profilbestätigung für den neuen Vorschlag ausgeführt.

Erwartet werden `passed: true`, `openAiCalled: false`, `proposalStatus: "proposed"`, `modelRequests: 1`, `duplicateReused: true` und die drei Unverändert-Nachweise.

Separater echter Modelllauf, mit vorhandenem serverseitigem `OPENAI_API_KEY` in der Prozessumgebung oder in der ausgeschlossenen Repository-Root-Datei `.env`:

```sh
npm run demo:erni-dialog:openai
```

Dieser Befehl zeigt vor dem Transfer den Verarbeitungshinweis und verwendet ausschließlich den serverseitig verfassten Pflichtdialog und den geprüften erfundenen Ausgangswert. Die tatsächliche Antwort muss denselben Assertions genügen; die Wiederzustellung darf keinen zweiten Responses-Aufruf verursachen. Bei Erfolg steht `openAiCalled: true`. Ohne Schlüssel beendet sich der Lauf vor jedem Modellaufruf mit `MODEL_KEY_REQUIRED`. Kontozugriff, Kosten und Modellqualität sind durch den Offline-Lauf nicht nachgewiesen. Es gibt keinen automatischen Wechsel auf einen anderen Anbieter oder ein anderes Modell.

Gezielte Integrationstests nach dem Build:

```sh
npm run build
node --test tests/erni-dialog.test.mjs
```

Diese Tests verwenden einen temporären lokalen HTTP-Listener. `npm test` prüft zusätzlich den bestehenden Backendumfang, Client-Typen und exportierte Verträge. Der echte Modelllauf gehört nicht zur normalen Testsuite.

## Verbleibender Umfang

Der Eingang bleibt auf die drei dokumentierten erfundenen Demo-Beiträge und den geprüften Jahresbrutto-Ausgangswert begrenzt. Korrekturen und fachliche Unklarheiten, bewusste Neuauswertung nach Kontextkonflikten sowie Darios finale Voice-/Kundenanbindung folgen der vollständigen Spezifikation. Die hier getestete direkte Übergabe eines finalen `source=voice`-Transkripts ist kein Nachweis echter STT/TTS-Wiedergabe oder der zweistufigen Kundenbestätigung. Die bestehenden gemeinsamen Verarbeitungshinweise und das Kundenreview werden verwendet; `noExternalAiTransferAuthorized=true` bleibt erhalten.
