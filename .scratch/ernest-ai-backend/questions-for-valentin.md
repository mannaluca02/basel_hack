# Abstimmung mit Valentin: Extraktor und Advisor

**Beantwortet:** Die anschließende Nutzerklärung legt Integration, Modellprojektion,
Testfall und die zwei noch fehlenden Backend-Ergänzungen fest. Maßgeblich ist jetzt
[die Integrationsvereinbarung](integration-agreement.md). Die Fragen unten bleiben
als Gesprächshistorie erhalten, nicht als weiterhin offene Gesamtliste.

Geprüfter Stand: main f1048c2; lokal vorhandene Backend-Referenz
origin/feature/life-insurance-live-backend 563a187. Nur statisch gelesen,
nicht ausgeführt. Backend-Branch ist nicht Bestandteil dieses main-Stands.

## Was bereits vorliegt

- Frontend unter code/apps/web/src/app/core/advisor/: Verträge, Mock und CaseStore.
- Frontend-API-Modus noch nicht implementiert; HTTP/SSE-Adapter fehlt.
- Backend-Branch: Extraktionskontext, atomare Vorschlagspakete, Ersetzung
  offener Pakete, persistente Unklarheiten und getrennte Kundenannahme.
- Unsere älteren Fragen nach dem grundsätzlichen Bau dieser Backend-Funktionen
  sind damit überholt. Zu klären sind Vertragsdetails und Integration.

## Fragen – zuerst 1 bis 3 und 6 klären

### 1. Integrationsbasis

Können wir 563a187 als Basis für mein NestJS-Extraktormodul verwenden?
Soll es intern auf den Fallservice zugreifen oder dessen HTTP-API nutzen?
Wer integriert Backend und aktuellen Frontend-Stand, und wann?

Empfehlung: bestehende Runtime und Fallservice verwenden, keine zweite Speicherung.

### 2. Extraktionskontext und Tool-Mapping

Ist ExtractorContextSchema der verbindliche Eingang meines Moduls?
Welche synthetische Teilprojektion dürfen wir an OpenAI übermitteln,
obwohl die aktuelle Policy externe KI-Übertragung nicht autorisiert?
Können wir feste fachliche Schlüssel plus personId auf writablePaths abbilden?

Empfehlung: minimaler Modellkontext; IDs, Rechte und aktuelle Versionen
serverseitig binden. Das Modell erhält keine frei wählbaren API-URLs.

### 3. Erster Einkommensfall und Aufnahmevertrag

Welches vorhandene Feld ist für unseren ersten Test verbindlich:
monatliches Brutto im Finanzprofil oder jährliches Versicherungs-Brutto?
Wer verantwortet die Umrechnung und die Trennung von Netto-Budget und Brutto?
Verwenden wir ProposalBatchInputSchema mit messageId, Revisionen und Draft-Hash?

Empfehlung: genaue Feldsemantik vor dem ersten Modelltest festlegen.
7.000 CHF sind 700.000 Rappen pro Monat, nicht derselbe Jahresbetrag.
Brutto darf kein vorhandenes Nettoeinkommen überschreiben.

### 4. Korrektur, Rücknahme und veraltete Pakete

Der neue Workflow ersetzt offene Pakete, verlangt aber die Abdeckung ihrer
bisherigen Änderungspfade. Wie behandeln wir Teilkorrekturen, eine Verneinung
ohne Ersatzwert und Pakete, die nach Annahme eines anderen Pakets veraltet sind?
Brauchen wir eine explizite Rücknahme-/Ablehnungsaktion?

Empfehlung: unveränderte Teile einer Teilkorrektur erhalten; überholte Vorschläge
nicht weiter zur Annahme anbieten. Akzeptierte Historie bleibt erhalten.

### 5. Auflösung von Unklarheiten

Aktuell löst eine Antwort eine Unklarheit erst bei Kundenannahme des
Antwortpakets oder über eine eigene autorisierte Resolve-Aktion auf.
Soll das so bleiben? Wie unterscheiden wir eine beantwortete, noch nicht
angenommene Unklarheit von einer noch unbeantworteten, damit Dario nicht
dieselbe Frage wiederholt? Welche offenen Unklarheiten blockieren Berechnungen?

Empfehlung: Modell liefert Auflösungsvorschläge; Backend kontrolliert Übergänge.
Rückfragenkontext berücksichtigt auch ausstehende Antwortpakete.

### 6. Bestätigung und gesprochenes Ja

Paketannahme verändert den Draft, Geldfelder bleiben zunächst proposed;
Gesamtprofilbestätigung ist eine eigene Aktion. Bestätigen wir diese zwei Stufen?
Was nennen wir gegenüber der Person angenommen beziehungsweise bestätigt?
Wer bindet gesprochenes Ja kundenautorisiert an Paket-ID und gültigen Stand?

Empfehlung: klare zwei Stufen. Ein Ja zu einem Paket bestätigt nicht stillschweigend
das gesamte Profil; Extraktor darf selbst weder annehmen noch freigeben.

### 7. Advisor-Adapter, Versionen und Zuständigkeiten

Wer übernimmt HTTP/SSE-Adapter, Extraktor, Annahmeaktion und Dario-Anschluss?
Welcher Vertrag gilt auf dem Draht: gemeinsame Backend-Runtime-Schemas mit
explizitem Mapping auf UI-Modelle? Wie transportieren wir eine verbindliche
Snapshot-/Event-Reihenfolge statt Run-IDs nach Erstankunft zu sortieren?
Wann testen wir den ersten gemeinsamen Durchlauf?

Empfehlung: Backend-Schemas als Wire-Vertrag; UI-Projektion im Adapter.
Nächste inhaltliche Frage erst nach Verarbeitung des abgeschlossenen Turns.

## Konkrete Code-Anker

Main:
- code/apps/web/src/app/core/advisor/contracts.ts
- code/apps/web/src/app/core/advisor/advisor-data-source.ts
- code/apps/web/src/app/core/advisor/provide-advisor-data-source.ts
- code/apps/web/src/app/core/advisor/store/case-state.ts
- code/apps/web/src/app/core/advisor/mock/mock-call-script.ts

Nur Backend-Branch 563a187:
- code/packages/contracts/src/proposal-workflow.ts
- code/apps/api/src/insurance/extraction.ts
- code/apps/api/src/insurance/draft-proposals.ts
- code/apps/api/src/insurance/http.ts
- code/tests/extraction-workflow.test.mjs

## Anschluss an unsere Abnahme

Betragsvorschlag, Korrektur, unklare Partnerangabe, Klärungsantwort sowie
Duplikate/Modellfehler bleiben die vereinbarten Fälle. Die neuen Backend-Funktionen
decken dafür bereits mehr ab als der alte Stand bdddd8e; der vollständige
Modell-/Live-Durchlauf ist noch nicht nachgewiesen.
