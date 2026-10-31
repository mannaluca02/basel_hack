# 01: Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

Status: ready-for-agent
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

- [ ] `VoiceLogSchema` validiert den finalen Nutzerbeitrag; der rollengetrennte Unterhaltungslog wird separat erhalten. Finale Text- und Voice-Beiträge verwenden denselben fachlichen Weg. Partielle Transkripte, Roh-Audio und ungültige Eingänge erreichen weder Modelltransport noch Fallmutation.
- [ ] Vor Auswertung wird ein frischer autorisierter Kontext geladen und gegen `ExtractorContextSchema` geprüft. Actor und Fallbindung stammen aus serverseitiger Authentifizierung, nicht aus Modellargumenten.
- [ ] Nur ausdrücklich erfundene Eingaben erreichen den synthetischen Adapter. Ein `synthetic`-Label oder nachträgliches Pseudonymisieren echter Logs allein reicht nicht als Herkunftsnachweis; der Demo-Einstieg begrenzt die Eingaben entsprechend.
- [ ] Der tatsächliche ausgehende Payload enthält nur erfundenen Gesprächsausschnitt, pseudonyme Personen-IDs, relevante Werte mit Einheit/Basis, erlaubte Ziele und benötigte Rückfragen. Keine Sitzungs-/Provider-Tokens, Rechte, Revisionen, Hashes, Historie, Eigentümer-/Kontaktdaten oder vollständiger `ExtractorContext`.
- [ ] Responses bietet ausschließlich `submit_intake_proposals` an. Toolname, Struktur, Werttypen, stabile Personen-ID und aktuelle `writablePaths` werden gemeinsam geprüft. Keine frei wählbaren URLs, Fall-IDs, Bestätigungsaktionen oder Modellmetadaten zur Freigabe.
- [ ] Earnies Code ergänzt Quellen-/Nachrichtenreferenzen und die unveränderte aktuelle Basis außerhalb des Modells, validiert `ProposalBatchInputSchema` und reicht zusammengehörige Angaben atomar über `proposeBatch()` ein.
- [ ] „Mein Bruttojahreseinkommen beträgt 119’000 Franken.“ erzeugt genau eine Änderung: `insurance.persons.0.grossAnnualIncomeCents`, `personId=person_demo_1`, `value=11900000`, Paketstatus `proposed`. `financial.persons.0.income`, Entwurf und bestätigte Snapshots bleiben vor Annahme unverändert.
- [ ] KI-Fragen/Beispiele sind ausschließlich Kontext; Smalltalk oder ein Turn ohne Angaben/Unklarheiten erzeugt kein leeres Paket. Gesprächsanweisungen können keine zusätzlichen Rechte erteilen.
- [ ] Ungültiger Output oder ein fehlgeschlagener Toolaufruf speichert keinen Teil des Ergebnisses und liefert einen sichtbaren Fehler. Schlüssel bleiben serverseitig; Diagnoseausgaben enthalten keine Dialog-/Fallinhalte oder Tokens.
- [ ] Der Adapter sieht einen Verarbeitungshinweis mit Anbieter, synthetischem Inhalt und Extraktionszweck vor dem ersten externen Aufruf vor. In 01 wird dies mit simuliertem Transport geprüft; echte externe Läufe folgen erst in 10 nach den konsistenten Hinweisen aus 02. `noExternalAiTransferAuthorized=true` wird weder umgedeutet noch pauschal aufgehoben.

## Tests

Vollständige Turns mit echter Runtime, temporärem verschlüsseltem Store, echten Kunden-/Agentrollen und ausschließlich simuliertem externem Modelltransport. Prüfen: Pflichtfall, finaler Text/Voice, KI-Beispiel ohne Nutzerangabe, Smalltalk, Schemafehler, fremder Fall/Actor, ungültiges Toolziel/Person, eingeschleuste Bestätigungsmetadaten und nicht synthetische Herkunft. Den tatsächlich ausgehenden Payload am Transport erfassen und seine Grenze prüfen. Keine Tests privater Helfer oder exakter Promptformulierungen. Vorhandene Backend-Tests wiederverwenden; kein Live-Aufruf als Teil dieses automatisierten Nachweises.

## Comments
