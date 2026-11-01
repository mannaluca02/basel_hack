# 09: Vollständige Dialog-Turn-Abnahme ohne externe Dienste nachweisen

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 03 — Eindeutige Korrekturen ohne Verlust zusammengehöriger Angaben übernehmen; 04 — Personen- und Einkommensunklarheiten bis zur Antwortübernahme führen; 05 — Turns bei Wiederzustellung, Versionswechsel und Fehlern zuverlässig verarbeiten; 06 — Laufende Extraktion beim gemeinsamen Gesprächsstopp verwerfen

## What to build

Die abgestimmte automatisierte Modulabnahme belegt reproduzierbar vollständige Dialog-Turns: finaler Nutzerbeitrag und rollengetrennter Unterhaltungslog hinein, beobachtbarer Vorschlags-/Unklarheiten- und Fallstand heraus. Die pro Verhalten entstandenen Tests werden zu einem ausführbaren Gesamtnachweis vervollständigt, nicht nochmals kopiert.

## Umfang und Zuständigkeit

Earnie verantwortet die Testgrenze seiner tatsächlichen Orchestrierung; Runtime, Fallservice, Rollen, Schemas und temporärer verschlüsselter Store sind echt. Ausschließlich der externe Modelltransport wird simuliert. Bestehende Extraktions-, Bestätigungs-, Shared-Contracts-, Nest- und Handover-Tests bleiben erhalten. Keine Ersatz-Orchestrierung für Tests, keine neue allgemeine Testplattform.

## Voraussetzungen

- 03–06 mit ihren verhaltensbezogenen Tests; 01 ist darüber bereits enthalten.
- Keine Kunden-UI oder echte Voice erforderlich: Diese Testgrenze ist ausdrücklich eigenständig. Reale Kundenaktionen werden über den vorhandenen Fallservice ausgelöst.

## Abnahmekriterien

- [ ] Der vollständige Pflicht-Turn erzeugt exakt `person_demo_1` / `insurance.persons.0.grossAnnualIncomeCents` / `11900000` als unbestätigten Vorschlag. Budget-Netto, Entwurf und bestätigte Historie bleiben vor Annahme unverändert.
- [ ] Abgedeckt sind Rollen/Eingabegrenze/Smalltalk, offene und bestätigte Korrektur, zusammengehörige Teilkorrektur, Partner-/Basis-/Periodenunklarheit, 13-Monats-Klärung, beantwortete/veraltete Unklarheit und Widerspruch.
- [ ] Abgedeckt sind Duplikat und ID-Konflikt, konkurrierender Versionswechsel mit sachlicher Neuauswertung, verweigerter/unvollständiger/ungültiger Output, Timeout/Transport-/Toolfehler sowie unzulässige Ziele oder Bestätigungsmetadaten.
- [ ] Die tatsächlich ausgehende synthetische Projektion und die Abweisung nicht synthetischer Herkunft sind belegt. Modelltransport erhält keine Geheimnisse, vollständigen Kontexte, Rechte, Revisionen oder Hashes.
- [ ] Übergabe während eines laufenden Modellturns, sofortiges Resume und verspätete Ergebnisse zeigen keinen alten Vorschlag. Kunden-/Agentrollen und unveränderte nicht betroffene Daten sind Teil der Beobachtung.
- [ ] Tests prüfen fachliche Ergebnisse und verbotene Seiteneffekte, keine privaten Helfer, exakten Prompts oder interne Aufrufreihenfolgen. Modellantworten sind kontrollierte Fixtures und werden nicht als Nachweis echter Extraktionsqualität ausgewiesen.
- [ ] Neue Modultests und die bestehende Backend-Testsuite einschließlich Build, Client-Typprüfung und Vertragsprüfung laufen erfolgreich. Relevante Ergebnisse, verwendeter Commit und verbleibende Grenzen werden ohne sensible Inhalte im Abnahmenachweis festgehalten.

## Tests und Ausführung

Im vorhandenen Backend-Workspace `npm test` verwenden; es umfasst derzeit Build, `typecheck:clients`, `contracts:check` und Node-Tests. Bereits in 01/03–06 entstandene Tests gezielt ergänzen und im normalen Lauf aufnehmen. Bestehende Extraktions- und Voice-Bestätigungsdemos können ergänzen, ersetzen die Modulgrenze aber nicht. Kein OpenAI-, STT/TTS- oder Live-Rechneraufruf in dieser Abnahme. Die gemeinsame Kundenanzeige und echte Voice bleiben 11 vorbehalten.

## Comments
