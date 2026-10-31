# 05: Turns bei Wiederzustellung, Versionswechsel und Fehlern zuverlässig verarbeiten

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 01 — Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

## What to build

Wiederholte, verspätete oder fehlgeschlagene Verarbeitung verliert keine gültigen Angaben und erzeugt keine zusätzlichen fachlichen Vorgänge. Jeder neue Gesprächsschritt verwendet einen aktuellen autorisierten Fallstand.

## Umfang und Zuständigkeit

Earnie ergänzt Turn-Orchestrierung und Wiederholungsbehandlung an der vorhandenen Modulgrenze. Valentins Idempotenz-, Revisions- und Transaktionsprüfungen bleiben zentral. Keine neue Datenbank, zweite Fallkopie oder allgemeine Jobplattform; bei erforderlichen gemeinsamen Vertragsänderungen bleibt Valentin zuständig.

## Voraussetzungen

- 01 und dessen echte Dialog-/Modell-/Tool-Strecke.
- Bestehende Paketidentitäten, Quellenreferenzen und Kontext-/Revisionsfehler verwenden. Numerisches Timeout ist ein endlicher Implementierungsparameter, kein neues SLA.

## Abnahmekriterien

- [ ] Beiträge desselben Falls werden sequenziell verarbeitet. Die nächste inhaltliche Antwort wartet auf den verarbeiteten Stand des vorherigen Turns und prüft vor Freigabe ihren aktuellen Zustandsbezug.
- [ ] Identische Wiederzustellung nutzt dieselbe Extraktionsnachrichten-ID und denselben validierten Paketinhalt. Auch bei einem potenziell anderen neuen Modelloutput entstehen kein zweites Paket, keine doppelten Unklarheiten und keine zusätzliche Mutation.
- [ ] Geänderter Inhalt unter derselben ID liefert einen Konflikt. Eine bewusste Neuauswertung nach Kontextänderung erhält eine neue Extraktionsnachrichten-ID, behält aber den Bezug zum ursprünglichen Voice-Beitrag und Turn.
- [ ] Bei `VERSION_CONFLICT`, `STALE_CONTEXT` oder `STALE_PROPOSAL` wird der Kontext neu geladen und der Beitrag sachlich neu ausgewertet. Eine neue Revision oder ein neuer Hash wird niemals lediglich auf ein altes Modellergebnis gesetzt.
- [ ] Verweigerung, unvollständiger/ungültiger Output, Transportfehler, Toolfehler und endlicher Timeout belassen den letzten gültigen Vorschlags-/Fallstand und liefern einen sichtbaren wiederholbaren Turnfehler; späte Ergebnisse werden nicht nachträglich aktiviert.
- [ ] Bei unklarem Speicherausgang wird zuerst der zentrale Zustand anhand der vorhandenen Identität geprüft. Ein bereits erfolgreich gespeicherter Vorgang wird nicht neu erzeugt; bei anschließendem Prozessneustart bleibt der zentrale Paketnachweis maßgeblich.
- [ ] Sitzungs-, Berechtigungs-, Fallablauf- und Löschfehler werden nicht als erfolgreiche Extraktion behandelt und führen nicht zu unautorisierten Retries. Fehlgeschlagene Turns blockieren die Folgearbeit nicht dauerhaft.

## Tests

Kontrollierter Modelltransport verzögert Antworten oder löst Fehler aus; der Fallservice und Store bleiben echt. Prüfen: parallele Zustellung desselben Turns, sequenzielle verschiedene Turns, Replay mit veränderter Modellantwort, geänderte Eingabe unter gleicher ID, konkurrierende Falländerung und sachliche Neuauswertung mit neuer ID. Zusätzlich erfolgreiche Speicherung mit verlorener Antwort und Wiederholung nach Runtime-Neustart, Timeout mit später Antwort sowie widerrufene Sitzung/Fallablauf/-löschung. Fachlichen Zustand und Quellenbezüge beobachten, keine interne Aufrufreihenfolge festschreiben.

## Comments
