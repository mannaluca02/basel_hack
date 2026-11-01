# 01: Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

Status: resolved
Type: task
Owner: Earnie
Blocked by: None (kann sofort beginnen)

## What to build

Eine ausdrücklich synthetische, finale Nutzeräußerung durchläuft Earnies tatsächlichen Dialogeingang, die kleine Modellprojektion, den Responses-Adapter und das begrenzte Aufnahme-Tool bis zu einem unbestätigten Feldvorschlag im gemeinsamen Fallservice. Der erste nachweisbare Durchlauf verwendet einen simulierten Modelltransport; der Adapter unterstützt denselben Weg für den späteren separaten OpenAI-Lauf.

## Umfang und Zuständigkeit

Earnie verantwortet Registrierung des `ErniDialogModule` im vorhandenen Nest-Prozess, Authentifizierungsanschluss, Extraktion, synthetischen Adapter, Output-Validierung und Einreichung über `LIFE_RUNTIME`. Valentins Fallservice, Verträge und verschlüsselter Store werden verwendet. Keine zweite Fallhaltung und keine neuen Bestätigungsrechte. UI-Anschluss und bestehende öffentliche Verarbeitungshinweise gehören zu 02; echte Voice-Übergabe zu 07.

## Voraussetzungen

- Gemeinsamer Stand von `@pax/contracts`; vorhandene Modulregistrierung über `createLifeInsuranceApp(options, [ErniDialogModule])` und serverseitiger fallbezogener Actor.
- Vorbereiteter synthetischer Fall mit `person_demo_1` und unverändert festgehaltenem Budget-Netto. Aktuellen Stand bei Beginn erneut prüfen.
- Startmodell und gültige Responses-Schnittstelle bei Umsetzung anhand offizieller Dokumentation prüfen; keine Modell-ID aus historischen Notizen übernehmen.

## Abnahmekriterien

- [x] `VoiceLogSchema` validiert den finalen Nutzerbeitrag; der rollengetrennte Unterhaltungslog wird separat erhalten. Finale Text- und Voice-Beiträge verwenden denselben fachlichen Weg. Partielle Transkripte, Roh-Audio und ungültige Eingänge erreichen weder Modelltransport noch Fallmutation.
- [x] Vor Auswertung wird ein frischer autorisierter Kontext geladen und gegen `ExtractorContextSchema` geprüft. Actor und Fallbindung stammen aus serverseitiger Authentifizierung, nicht aus Modellargumenten.
- [x] Nur ausdrücklich erfundene Eingaben erreichen den synthetischen Adapter. Ein `synthetic`-Label oder nachträgliches Pseudonymisieren echter Logs allein reicht nicht als Herkunftsnachweis; der Demo-Einstieg begrenzt die Eingaben entsprechend.
- [x] Der tatsächliche ausgehende Payload enthält nur erfundenen Gesprächsausschnitt, pseudonyme Personen-IDs, relevante Werte mit Einheit/Basis, erlaubte Ziele und benötigte Rückfragen. Keine Sitzungs-/Provider-Tokens, Rechte, Revisionen, Hashes, Historie, Eigentümer-/Kontaktdaten oder vollständiger `ExtractorContext`.
- [x] Responses bietet ausschließlich `submit_intake_proposals` an. Toolname, Struktur, Werttypen, stabile Personen-ID und aktuelle `writablePaths` werden gemeinsam geprüft. Keine frei wählbaren URLs, Fall-IDs, Bestätigungsaktionen oder Modellmetadaten zur Freigabe.
- [x] Earnies Code ergänzt Quellen-/Nachrichtenreferenzen und die unveränderte aktuelle Basis außerhalb des Modells, validiert `ProposalBatchInputSchema` und reicht zusammengehörige Angaben atomar über `proposeBatch()` ein.
- [x] „Mein Bruttojahreseinkommen beträgt 119’000 Franken.“ erzeugt genau eine Änderung: `insurance.persons.0.grossAnnualIncomeCents`, `personId=person_demo_1`, `value=11900000`, Paketstatus `proposed`. `financial.persons.0.income`, Entwurf und bestätigte Snapshots bleiben vor Annahme unverändert.
- [x] KI-Fragen/Beispiele sind ausschließlich Kontext; Smalltalk oder ein Turn ohne Angaben/Unklarheiten erzeugt kein leeres Paket. Gesprächsanweisungen können keine zusätzlichen Rechte erteilen.
- [x] Ungültiger Output oder ein fehlgeschlagener Toolaufruf speichert keinen Teil des Ergebnisses und liefert einen sichtbaren Fehler. Schlüssel bleiben serverseitig; Diagnoseausgaben enthalten keine Dialog-/Fallinhalte oder Tokens.
- [x] Der Adapter sieht einen Verarbeitungshinweis mit Anbieter, synthetischem Inhalt und Extraktionszweck vor dem ersten externen Aufruf vor. In 01 wird dies mit simuliertem Transport geprüft; echte externe Läufe folgen erst in 10 nach den konsistenten Hinweisen aus 02. `noExternalAiTransferAuthorized=true` wird weder umgedeutet noch pauschal aufgehoben.

## Tests

Vollständige Turns mit echter Runtime, temporärem verschlüsseltem Store, echten Kunden-/Agentrollen und ausschließlich simuliertem externem Modelltransport. Prüfen: Pflichtfall, finaler Text/Voice, KI-Beispiel ohne Nutzerangabe, Smalltalk, Schemafehler, fremder Fall/Actor, ungültiges Toolziel/Person, eingeschleuste Bestätigungsmetadaten und nicht synthetische Herkunft. Den tatsächlich ausgehenden Payload am Transport erfassen und seine Grenze prüfen. Keine Tests privater Helfer oder exakter Promptformulierungen. Vorhandene Backend-Tests wiederverwenden; kein Live-Aufruf als Teil dieses automatisierten Nachweises.

## Answer

Umgesetzt am 31.10.2026 auf `feature/ernie-01-jahresbrutto-dialog-turn`, ausgehend vom frisch abgerufenen `origin/main` **6f84c65**. Der zuvor ausgecheckte Dokumentationsbranch war sauber; der lokale `main` lag noch auf **9ab4e40**. Der aktuelle Main enthält die zentralen Extraktions-, Bestätigungs- und Stoppverträge, aber noch kein Earnie-Dialogmodul. Keine vorhandenen lokalen Änderungen wurden entfernt. Keine Commits, Pushes oder Branch-Merges ausgeführt.

### Umsetzung

- Neues optionales [ErniDialogModule](../../../code/apps/api/src/erni-dialog/module.ts) im bestehenden Nest-Prozess: Registrierung über `createLifeInsuranceApp(options, [ErniDialogModule.register({ transport })])`; unveränderte Nutzung von `LIFE_RUNTIME`, `LifeSessionGuard`, `sessions`, `extraction.context()` und `extraction.proposeBatch()`. Keine zweite Fallhaltung und keine Änderung gemeinsamer Backend-Verträge oder Bestätigungsrechte.
- `POST /api/cases/:caseId/erni-dialog/turns` nimmt einen strikten finalen `VoiceLog` mit separatem rollengetrenntem Gesprächsausschnitt entgegen. Text und Voice verwenden denselben Weg. Der serverseitig authentifizierte Advisor muss an den Fall gebunden sein; vor Auswertung wird der frische Kontext gegen `ExtractorContextSchema` geprüft.
- Die Herkunftsgrenze ist ein serverseitig verfasster Demo-Katalog mit exaktem Text-/Rollenabgleich. Ein frei behauptetes synthetisches Label genügt nicht. Der Katalog bindet den Sprecher an `person_demo_1`. Ausschließlich dessen geprüfter erfundener Ausgangswert, Jahresbruttobasis, Einheit und aktueller erlaubter Zielpfad werden projiziert; andere Personen, Budget-Netto, Kontakt-/Besitzdaten, Historie, Tokens, Berechtigungen, Revisionen und Hashes gehen nicht an den Modelltransport.
- Der [Responses-Adapter](../../../code/apps/api/src/erni-dialog/responses.ts) bietet ausschließlich das strikte Tool `submit_intake_proposals` an. Toolname, Struktur, ganzzahlige Rappen, aktueller Pfad und zugehörige stabile Person werden gemeinsam geprüft. Quellen, Nachrichtenreferenz und unveränderte aktuelle Basis setzt der Server; anschließend validiert er `ProposalBatchInputSchema` und reicht genau ein atomares Paket ein. Ungültiger Output, Verweigerungen und Transport-/Toolfehler liefern sichtbare Fehler ohne Teilpersistenz. Leere Turns speichern kein Paket; KI-Beispiele können keine Nutzerangabe erzeugen.
- Der Adapter ist standardmäßig ohne aktiven Transport. Der Verarbeitungshinweis benennt OpenAI, erfundene Inhalte und den Extraktionszweck; seine Versionsbestätigung ist vor dem Transport erforderlich. `noExternalAiTransferAuthorized=true` bleibt unverändert. Derselbe Adapter besitzt einen ausdrücklich zu konfigurierenden serverseitigen Responses-Transport für Ticket 10, der hier nicht ausgeführt wurde. Endlicher Timeout: 15 Sekunden. Schnittstelle und Startmodell `gpt-5.6-terra` wurden anhand der [offiziellen Function-Calling-Dokumentation](https://developers.openai.com/api/docs/guides/function-calling) und [Modellseite](https://developers.openai.com/api/docs/models/gpt-5.6-terra) geprüft; Kontoverfügbarkeit und Modellqualität sind damit nicht abgenommen.

Bedienung und bewusst begrenzte Demo-Herkunft stehen in der [Moduldokumentation](../../../code/apps/api/src/erni-dialog/README.md).

### Prüfergebnisse

Die [15 neuen Integrationstests](../../../code/tests/erni-dialog.test.mjs) verarbeiten vollständige authentifizierte HTTP-Dialog-Turns mit echter Runtime, echten Kunden-/Advisorrollen und temporärem verschlüsseltem Store. Nur der Modelltransport ist simuliert; der Rechner ist der vorhandene synthetische Testprovider.

- Pflichtfall für finalen Text und Voice erfolgreich: **119’000 CHF → 11’900’000 Rappen**, genau `insurance.persons.0.grossAnnualIncomeCents`, `personId=person_demo_1`, Paketstatus **proposed**. Entwurf einschließlich bisherigem Jahresbrutto, Budget-Netto und bestätigte Snapshots bleiben vor Annahme unverändert.
- Geprüft: tatsächlich ausgehender Payload und enge Tool-Enums, getrennte Sprecherrollen, Smalltalk, KI-Beispiel einschließlich unzulässiger modellseitiger Übernahme, partielle Transkripte/Audio, Schema- und Herkunftsfehler, fremde Fälle/Sitzungen/Rollen, fehlender Hinweis, unzulässige Pfade/Personen/Werttypen, Bestätigungs-/Versionsmetadaten, doppelte Änderungen, falsches Tool, unvollständige Antworten/Verweigerung/Transportfehler, fehlgeschlagene zentrale Einreichung sowie frische Basis nach einer lokalen Falländerung. Auch ein formal gültiger Vorschlag für die andere bestehende Person wird zurückgewiesen.
- TDD-Nachweis: zunächst fehlendes Dialogmodul; zusätzliche fehlschlagende Verhaltenstests für Verweigerung/unfertige Ausgabe, KI-Beispielübernahme, doppelte Änderungen und falsche Sprecherperson; anschließend alle erfolgreich.
- Abschließendes **`npm test` mit Node 22.23.4/npm 10 erfolgreich**: Build, Client-Typprüfung, **25** gemeinsame JSON-Schemas und **178/178 Tests** (163 bestehende + 15 neue), keine übersprungenen Tests. `git diff --check` erfolgreich. Getrennte Reviews zu Repository-Vorgaben und Ticket-Abdeckung ergaben nach Korrektur der Sprecherzuordnung keine offenen Befunde.

Die vorhandene Gesamtinstallation `npm ci` scheitert bereits auf der Main-Basis, weil der Angular-Workspace im Root-Lockfile fehlt; Host-Node 26 liegt außerdem außerhalb der Projekt-Engines. Für die Nachweise wurden Node 22/npm 10 und die unveränderten Backend-Lockfile-Abhängigkeiten isoliert unter `/private/tmp` eingerichtet und lokal eingebunden. Paketdateien und Lockfile wurden nicht verändert. Die HTTP-Tests benötigen außerhalb der Sandbox einen lokalen Loopback-Listener; der erste Sandbox-Lauf scheiterte ausschließlich an dieser Sperre, der abschließende Gesamtlauf war vollständig erfolgreich.

### Abgrenzung

Nur Ticket 01 abgeschlossen. Der Eingang bleibt auf die dokumentierten erfundenen Demo-Beiträge und den geprüften Ausgangswert begrenzt; kein allgemeiner Kundendialog ist freigegeben. Ticket 02 einschließlich gemeinsamer öffentlicher Hinweise/Kundenanzeige bleibt beim vorgesehenen Besitzer. Korrekturen, Unklarheiten, Wiederzustellung, laufende Gesprächsstopps und tatsächlicher Voice-Anschluss folgen ihren eigenen Tickets. **Keine echten OpenAI-Aufrufe und keine Abnahme der Modellqualität**; diese folgt ausschließlich in Ticket 10. Keine gemeinsame Voice-/Kundenabnahme vor Ticket 11.

## Comments
