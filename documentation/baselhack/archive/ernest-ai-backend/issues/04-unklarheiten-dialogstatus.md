# 04: Personen- und Einkommensunklarheiten bis zur Antwortübernahme führen

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 01 — Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

## What to build

Fehlende Person, Einkommensbasis oder Periode führt zu höchstens einer zusammengehörigen Rückfrage im nächsten passenden Turn. Eine vollständige Antwort wird zur Übernahme angeboten; eine beantwortete Unklarheit wird nicht nochmals abgefragt und erst nach Kundenaktion fachlich aufgelöst.

## Umfang und Zuständigkeit

Earnie verantwortet Extraktion, Bezug der Rückfrage und nächsten Gesprächsschritt. Valentins vorhandene stabilen Unklarheits-IDs und abgeleiteter Gesprächsstatus sind maßgeblich. Dario setzt das tatsächliche Sprech-Timing in 07 um; Kundenannahme und Darstellung bleiben bei 02/08. Keine eigene persistente Unklarheitenverwaltung.

## Voraussetzungen

- 01; die bestehenden `dialogueStatus`, `answerBatchId`, `pendingAcceptanceBatchIds` und `resolvesAmbiguityIds` verwenden.
- Für diesen unabhängig von 03 ausführbaren Nachweis offene/ersetzte Antwortpakete bei Bedarf mit dem vorhandenen Fallservice vorbereiten.

## Abnahmekriterien

- [ ] „Mein Partner verdient 6’000.“ erzeugt ohne eindeutige Person keinen gerateten Feldvorschlag. Zuerst wird die Person geklärt; ohne zulässigen Feld-/Personenbezug bleibt die Zuordnungsfrage im Dialogkontext, statt eine Personen-ID oder einen Speicherpfad zu erfinden.
- [ ] Bei eindeutigem Personenbezug, aber fehlender Basis/Periode wird eine passende zentrale Unklarheit mit serverseitiger ID und Quellenbezug erzeugt. Aus Brutto wird kein Budget-Netto abgeleitet.
- [ ] „Monatlich und brutto.“ klärt noch nicht die Jahresbasis. Zusätzliche Monatslöhne einschließlich eines 13. Monatslohns werden geklärt, bevor ein Jahresbrutto vorgeschlagen wird.
- [ ] 6’000 CHF monatlich brutto und ausdrücklich 13 gleich hohe Monatslöhne ergeben für die eindeutig zugeordnete Person 7’800’000 Rappen Versicherungs-Jahresbrutto, Budget-Netto unverändert.
- [ ] Das gültige Antwortpaket referenziert vorhandene offene IDs über `resolvesAmbiguityIds`. Danach bleibt der Fachstatus `open`, Gesprächsstatus ist `awaiting_customer_acceptance`; die nächste Aktion bietet die Antwortübernahme an. Erst Kundenannahme führt zu `resolved`.
- [ ] Bei `needs_answer` wird höchstens eine zusammengehörige Frage im nächsten passenden Antwortturn gestellt, nach Abschluss der laufenden Auswertung. `resolved` erlaubt die Fortsetzung. Keine laufende Nutzeräußerung wird durch normale Aufnahme unterbrochen.
- [ ] Ersetzte, abgelehnte oder durch Basisänderung veraltete Antwortpakete führen nach frischem Kontext zum aktuellen Backend-Gesprächsstatus. Ein fehlendes `nextQuestion` wird bei ausstehender Annahme nicht als abgeschlossene Profilbestätigung interpretiert.
- [ ] Widersprüchliche Angaben ohne eindeutige Korrektur erzeugen eine Rückfrage, statt einen Wert eigenmächtig auszuwählen. Das Modell löst keine Unklarheit selbst auf.

## Tests

Vollständige Turns mit echtem Fallservice und simuliertem Modelltransport: uneindeutiger Partner, bekannte Person ohne Basis/Periode, unvollständige Monatsklärung, vollständige 13-Monats-Klärung, Widerspruch, beantwortete Frage und anschließende echte Kundenannahme. Antwortpaket zusätzlich ersetzen, ablehnen und durch eine Basisänderung veralten lassen; nächsten beobachtbaren Gesprächsschritt prüfen. Keine privaten Statusableitungen oder exakten Frageformulierungen testen.

## Comments
