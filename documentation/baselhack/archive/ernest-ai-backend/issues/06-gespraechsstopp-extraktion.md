# 06: Laufende Extraktion beim gemeinsamen Gesprächsstopp verwerfen

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 01 — Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

## What to build

Eine angeforderte menschliche Übergabe beendet Earnies digitale Aufnahme sofort. Ein alter Turn bleibt auch nach schneller Wiederaufnahme beendet; erst ein neuer Turn auf frischem Stand darf wieder Vorschläge erzeugen.

## Umfang und Zuständigkeit

Earnie schließt seine tatsächliche Modell-/Tool-Orchestrierung an das vorhandene Stoppsignal an. Valentin besitzt Übergabezustand, Revision und Serversperren; Dario beendet seine Audio-/Transkriptarbeit in 07/08. Keine neue Übergabe-UI, Telefonie oder Beratervermittlung.

## Voraussetzungen

- 01; vorhandenes `ExtractorContext.handover` und gemeinsames `advisor.context.updated`-Signal einschließlich Übergaberevision und `interruptPolicy=immediate` verwenden.
- `HUMAN_HANDOVER_ACTIVE` bleibt eine verbindliche Serversperre.

## Abnahmekriterien

- [ ] Bei `stopDigitalConversation=true` beginnt kein neuer Modell-/Tool-Turn.
- [ ] Aktive Übergabe oder erhöhte Übergaberevision bricht einen laufenden Turn ab; ein trotz Abbruch verspätetes Modellresultat wird weder eingereicht noch als nächste Gesprächsantwort freigegeben.
- [ ] Auch bei `request → resume` während des Modellaufrufs ist das alte Ergebnis verworfen, selbst wenn der zuletzt sichtbare Status schon wieder `digital` lautet.
- [ ] Nach ausdrücklichem kundenautorisiertem Resume wird für einen neuen Turn der Kontext frisch geladen. Alte Ergebnisse/Quellen werden nicht still weiterverarbeitet.
- [ ] Zustandsreload und Reconnect beachten dieselbe Übergaberevision; das Modul umgeht weder Sperren noch die Kundenautorisierung für Request/Resume.
- [ ] Bestehende bestätigte Profile, gültige Vorschläge und gespeicherte Ergebnisse werden durch den lokalen Turnabbruch nicht gelöscht oder verändert.

## Tests

Vollständiger Turn mit echtem Fallservice und verzögertem simuliertem Modelltransport. Übergabe vor Turnbeginn, während der Auswertung und mit sofortigem Resume auslösen. Einen Transport verwenden, der den Abbruch ignoriert, und ausbleibende späte Vorschläge nachweisen. Anschließend neuen Turn erfolgreich ausführen; Reconnect mit erhöhter Übergaberevision prüfen. Vorhandene Backend-Handover-Tests werden wiederverwendet, nicht als Ersatz für Earnies tatsächlichen Abbruch angesehen.

## Comments
