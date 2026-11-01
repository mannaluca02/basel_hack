# Vereinbarter Anschluss: Earnie, Valentin und Dario

Verbindliche Nutzerklärung nach Durchsicht des aktualisierten Advisor-/Backend-Stands.
Dies dokumentiert Entscheidungen, keinen Nachweis ihrer Implementierung oder Ausführung.
Ersetzt die frühere Monatsbrutto-Testdefinition in interview-decisions.md.

## 1. Integrationsbasis

- Neuer gemeinsamer Backend-Stand; Earnies Modul läuft im selben Nest-Prozess.
- Registrierung: createLifeInsuranceApp(options, [ErniDialogModule]).
- Verwendung von runtime.extraction.context() und proposeBatch().
- ExtractorContextSchema ist der verbindliche Eingang der Orchestrierung.
- Fallzustand und Persistenz bleiben zentral.
- HTTP ist nur die Alternative für einen getrennten Prozess.
- Responses mit strukturiertem Function Calling und dem begrenzten Aufnahme-Tool
  bleibt der erste Modellweg; Decisions erst später als optionales Gate vergleichen.

## 2. Synthetischer Modelladapter

An OpenAI geht ausschließlich eine kleine, ausdrücklich synthetische Projektion:
- erfundener Gesprächsausschnitt;
- pseudonyme Personen-ID;
- relevante Feldwerte mit Einheit und Einkommensbasis;
- erlaubte Zielpfade;
- betreffende Rückfragen.

Revisionen, Hashes und Berechtigungen setzt Earnies Code außerhalb des Modells.
Nicht den gesamten ExtractorContext weiterreichen. Die bestehende Policy erteilt
noch keine externe KI-Transferfreigabe. Beim Anschluss müssen der synthetische
Modelladapter und der entsprechende Verarbeitungshinweis ausdrücklich ergänzt werden.

## 3. Erster gemeinsamer Test

Vorbereiteter synthetischer Fall. Testsatz:

> Mein Bruttojahreseinkommen beträgt 119’000 Franken.

Erwartete Änderung im Vorschlagspaket:

```json
{
  "path": "insurance.persons.0.grossAnnualIncomeCents",
  "personId": "person_demo_1",
  "value": 11900000
}
```

- Ausschließlich jährliches Brutto ändern, zunächst als unbestätigten Vorschlag.
- financial.persons.0.income bleibt unverändert: im Beispiel jährliches Netto
  nach Einkommenssteuer.
- Kein Netto aus Brutto ableiten.
- Bei Monatsangaben unter anderem Behandlung eines 13. Monatslohns klären.
- Die weiteren vereinbarten Abnahmefälle bleiben relevant, sind aber an diese
  Feldsemantik und den bestätigten Paket-/Unklarheitenvertrag anzupassen.

## 4. Voice-Bestätigung – gemeinsame Backend-Erweiterung

Serverseitig gespeicherte, kurzlebige Bestätigungsanforderung bindet:
- Fall und authentifizierte Kundensitzung;
- eindeutige Bestätigungs-ID;
- genau eine Aktion, etwa accept_batch oder confirm_profile;
- Paket-ID beziehungsweise Entwurfshash und erwartete Revision;
- Referenz auf die tatsächlich gestellte Bestätigungsfrage.

Die Antwort muss auf diese Anforderung verweisen. Ein allgemeines Ja genügt nicht.
Geänderter Zustand oder eine neue Frage invalidieren die alte Anforderung.
Backend-Aufruf erfolgt mit authentifizierter Kundensitzung; der Agent-Token
erhält keine zusätzlichen Bestätigungsrechte.

„Diese Änderung übernehmen?“ und „Das Gesamtprofil einschließlich der genannten
Annahmen bestätigen?“ sind getrennte Schritte. Dasselbe Ja löst niemals beide aus.
Dieser Bestätigungsvertrag ist noch zu ergänzen.

## 5. Unklarheiten: Fachstatus und abgeleiteter Gesprächsstatus

| Situation | Gesprächsstatus | Nächste Aktion |
|---|---|---|
| Kein gültiges Antwortpaket | needs_answer | Rückfrage stellen |
| Aktuelles offenes Paket referenziert die Unklarheit über resolvesAmbiguityIds | awaiting_customer_acceptance | Antwort zur Übernahme vorlesen |
| Kunde nimmt das Paket an | resolved | Gespräch fortsetzen |

Bei awaiting_customer_acceptance bleibt die Unklarheit fachlich open,
wird aber nicht erneut als unbeantwortete Frage gestellt. Wird das Antwortpaket
veraltet, den Gesprächsstatus neu bewerten. Diese Ableitung ist noch zu ergänzen.

## 6. Zuständigkeiten

- Valentin: gemeinsame Backend-Erweiterungen für Bestätigungsanforderung
  und abgeleiteten Unklarheiten-Gesprächsstatus.
- Earnie: Extraktion, synthetische Modellanbindung und Aufnahme-Tool-Integration.
- Dario: Zuordnung von Bestätigungsfrage, tatsächlicher Wiedergabe und gesprochener Antwort.

## 7. Arbeitsreihenfolge und Status

1. Vereinbarten Backend-Stand als Implementierungsbasis integrieren.
2. Synthetische Modellprojektion, Adapter und Verarbeitungshinweis ergänzen.
3. Extraktion des Bruttojahres-Testfalls über proposeBatch() nachweisen.
4. Beide gemeinsamen Backend-Erweiterungen anschließen und mit Dario integrieren.
5. Paketannahme und separate Profilbestätigung Ende zu Ende prüfen; anschließend
   Korrektur-, Unklarheiten-, Versions- und Fehlerfälle abnehmen.

Gemeinsames Verständnis bestätigt; Entscheidungsinterview abgeschlossen.
Keine Implementierung durch diese Dokumentation vorgenommen. Konkretes Startmodell,
Zeitpunkt und zu integrierender Commit werden beim Umsetzungsstart geprüft.
