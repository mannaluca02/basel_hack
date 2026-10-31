# 03: Eindeutige Korrekturen ohne Verlust zusammengehöriger Angaben übernehmen

Status: ready-for-agent
Type: task
Owner: Earnie
Blocked by: 01 — Jahresbrutto aus einem finalen Dialog-Turn vorschlagen

## What to build

Eine eindeutige neue Aussage korrigiert den offenen Feldvorschlag nachvollziehbar. Bereits angenommene oder bestätigte Angaben erhalten einen neuen unbestätigten Vorschlag; ihre Historie bleibt erhalten.

## Umfang und Zuständigkeit

Earnie verbindet Modellprojektion, validierten Tooloutput und vorhandenen Ersetzungsworkflow. Valentin besitzt weiterhin die serverseitige Paketprüfung und Persistenz. Nur Versicherungs-Jahresbrutto wird neu extrahiert; das Bewahren vorhandener zusammengehöriger Vorgängerwerte öffnet keine weiteren Modellziele.

## Voraussetzungen

- 01 liefert vollständige Dialog-Turns und aktuelle Vorschlagspakete.
- Vorhandene `supersedesBatchIds` und `supersedesProposalIds` sowie aktuelle Backend-Konfliktregeln wiederverwenden. Keine neue Ersetzungsmethode erforderlich.

## Abnahmekriterien

- [ ] Auf einen offenen Vorschlag über 119’000 CHF folgt „Nein, ich meinte 125’000 im Jahr, brutto.“: ein neues Paket über 12’500’000 Rappen ersetzt den offenen Vorgänger explizit; dieser bleibt als `superseded` mit Nachfolgerbezug erhalten und ist nicht mehr annehmbar.
- [ ] Bei Teilkorrektur bleiben sämtliche Änderungspfade des ersetzten Pakets im Nachfolger vertreten. Unveränderte Werte werden aus dem validierten aktuellen Vorgänger übernommen, nicht vom Modell neu erfunden; Ziel-/Personenprüfung bleibt erhalten.
- [ ] Ein vorhandener Legacy-Einzelvorschlag wird ausdrücklich über `supersedesProposalIds` ersetzt, statt parallel offen zu bleiben.
- [ ] Korrekturen angenommener Pakete oder bestätigter Angaben erzeugen ein neues annehmbares Paket gegen den aktuellen Stand; alte Pakete und bestätigte Snapshots werden nicht umgeschrieben.
- [ ] Ein bloßes Nein ohne Ersatzwert erzeugt keinen erfundenen Betrag. Ist es an eine Bestätigungsanforderung gebunden, wird es dem bestehenden Kundenworkflow überlassen; Earnies Agent führt keine Ablehnung/Annahme selbst aus.
- [ ] Ohne eindeutigen Korrekturbezug wird kein Wert ausgewählt. Der Turn bleibt klärungsbedürftig; die persistente Rückfrage und deren Lebenszyklus werden in 04 vervollständigt.
- [ ] Budget-Netto und unbetroffene bestätigte Daten bleiben unverändert; ungültige oder unvollständige Ersetzungen erzeugen keine Teilpersistenz.

## Tests

Am vollständigen Dialog-Turn mit echtem Fallservice und simuliertem Modelltransport prüfen: offene Korrektur, Teilkorrektur eines mehrteiligen Pakets, Legacy-Vorgänger, angenommener Vorgänger, bestätigter Snapshot und Nein ohne Wert. Einen vorhandenen gemischten Vorgänger als Fixture verwenden, ohne die Modell-Positivliste zu erweitern. Alten Annahmeversuch und unveränderte übrige Werte beobachten. Vorhandene interne Supersession-Tests des Fallservices wiederverwenden.

## Comments
