# Earnies Extraktionsflow – laufendes Entscheidungsinterview

Stand: 31.10.2026. Nur ausdrücklich geklärte Punkte; das Interview läuft weiter.
Dies ergänzt die Teampläne, ersetzt sie aber nicht. Noch kein Implementierungsauftrag.

## Ausgangslage

- Zeit laut Nutzer: ganzer Samstag und Sonntagvormittag; konkreter Integrationszeitpunkt noch offen.
- Außerhalb des Checkouts laut Nutzer bislang nur Planung.
- Erster persönlicher Umfang: Unterhaltungslog verarbeiten und Feldvorschläge liefern.
- OpenAI-API-Zugang mit laut Nutzer 75.– Guthaben vorhanden. Zugriff und Modellverfügbarkeit nicht getestet.
- Anderer Inferenzservice als mögliche spätere Ausweichlösung, noch nicht ausgewählt.

## Bestätigte Entscheidungen

- Eingang ist der Dialog der KI und der antwortenden Person mit Sprecherrollen.
- Laufende Verarbeitung während des Gesprächs; vorgeschlagener Trigger ist eine finalisierte Nutzeräußerung.
- Erster Durchlauf mit wenigen bestehenden, noch konkret abzustimmenden Fallfeldern und Nutzer-Beispieltexten.
- Zuerst ein Responses-Aufruf mit Structured Outputs für Feldvorschläge und Unklarheiten.
- Kontextpaket aus Dialog, aktuellem Stand, Unklarheiten und erlaubten Feldern im Code zusammenstellen.
- Decisions anschließend als vorgeschaltetes Relevanz-Gate anhand derselben Beispieltexte vergleichen; nicht Voraussetzung des ersten Durchlaufs.
- Backend verwaltet Unklarheiten mit stabilen IDs und liefert der Live-App den vollständigen aktuellen Stand.
- Aufgelöste Unklarheiten werden markiert; nur offene Einträge dienen als Rückfragenkontext.
- Auch vollständig erkannte Angaben bleiben Vorschläge bis zur ausdrücklichen Bestätigung.
- Eindeutige Korrekturen ersetzen ältere unbestätigte Vorschläge; Änderungen bestätigter Angaben benötigen einen neuen bestätigbaren Vorschlag.
- Live-App nutzt offene Unklarheiten im nächsten passenden Antwortturn, ohne laufende Rede zu unterbrechen; höchstens eine zusammengehörige Rückfrage.
- Die nächste inhaltliche Rückfrage wartet auf den aktualisierten Extraktionsstand des abgeschlossenen Turns. Bei Timeout letzten gültigen Stand behalten und Fehler signalisieren.

## Aktualisierung nach Team-Push

- Auf Nutzerauftrag `git pull --ff-only`: main von 6bf72c6 auf 7108950 aktualisiert (Angular-Grundgerüst).
- Backend separat auf origin/feature/life-insurance-live-backend, untersuchter Stand bdddd8e; nur gelesen, nicht gemergt oder ausgecheckt.
- Damit ist die frühere Aussage „nur Planung“ überholt: NestJS-Fallservice, gemeinsame Zod-Verträge, verschlüsselte Dateipersistenz, Vorschläge und Bestätigungsrouten sind auf dem Branch implementiert. Nicht selbst ausgeführt/getestet.
- Bestehende Agent-Vorschläge erlauben nur ausgewählte Felder auf vorhandenen Strukturen. Erstaufnahme, Korrekturlebenszyklus und Unklarheitenverwaltung fehlen noch.
- Vorschlagsannahme ändert den Entwurf; Gesamtprofilbestätigung bleibt separat. Mehrere Vorschläge gegen denselben Entwurfshash können bei sequenzieller Annahme veralten.
- Erstes Feldset ausdrücklich vertagt: nach Abgleich mit Valentins Implementierung neu entscheiden.
- Backend markiert externe KI-Übertragung derzeit als nicht freigegeben; vorhandener OpenAI-Zugang allein ändert diesen Vertrag nicht.

## Bestätigter Anschluss an Valentins Backend

- Extraktor als Modul im vorhandenen NestJS-Backend; dessen API/Fallservice schreibt den verbindlichen Speicherstand.
- Nutzer präzisiert gewünschten Werkzeugweg: Decisions wählt gegebenenfalls das zuständige API/Werkzeug; KI übermittelt extrahierte Informationen per Tool Call. Verhältnis zur zunächst optionalen Decisions-Stufe und konkrete Werkzeugrechte noch klären.
- Erster Durchlauf ändert einen vorbereiteten synthetischen Fall mit bestehender Person und Einkommensstruktur.
- Zielvertrag: zusammengehörige Änderungen als Vorschlagspaket gemeinsam validieren/annehmen; Gesamtprofilbestätigung bleibt separat.
- Erste externe Modellaufrufe ausschließlich mit synthetischen Dialog-/Falldaten.
- Eindeutige gesprochene Zustimmung darf ein konkret vorgestelltes Vorschlagspaket über dieselbe validierende Annahmeaktion wie die UI annehmen. Bindung an Paket-ID und aktuellen Stand sowie Kundenautorisierung mit Dario abstimmen.
- Ein begrenztes Aufnahme-Tool `submit_intake_proposals` übermittelt Feldvorschläge und Unklarheiten gemeinsam; keine frei wählbaren API-URLs oder separaten Tools je Feld.
- Direkter Responses-Tool-Flow zuerst; Decisions bleibt ein später zu vergleichendes optionales Relevanz-/Aktions-Gate.
- Aufnahme-Tool verändert nur Vorschlags-/Unklarheitenstand. Annahme erfolgt separat über eine autorisierte Bestätigungsaktion.
- Erster Test: Betrag des bestehenden monatlichen CHF-Bruttoeinkommens einer vorbereiteten synthetischen Person ändern; 7.000 CHF ergeben einen unbestätigten Vorschlag über 700.000 Rappen.
- Modell adressiert Personen über stabile Personen-IDs und Felder über erlaubte fachliche Schlüssel. Backend übersetzt in die bestehenden indexbasierten API-Pfade.
- Gesprächsbeiträge pro Fall sequenziell verarbeiten. Bei zwischenzeitlich anderweitig geändertem Fall Ergebnis vor Speicherung erneut prüfen; ältere Ergebnisse überschreiben keinen neueren Stand.
- Erweiterungen des gemeinsamen Fallservice zunächst mit Valentin abstimmen: atomare Vorschlagspakete, Korrekturlebenszyklus, persistente Unklarheiten und autorisierte Zustandsprojektion für Extraktion. Zuständigkeit für deren Umsetzung noch nicht zugesagt.
- Bei Modellfehlern keine Teilübernahme; bisherigen Vorschlagsstand behalten, Turnfehler sichtbar zurückgeben und Wiederholung ermöglichen. Wiederholung/doppelte Zustellung darf keine doppelten Vorschläge erzeugen.

## Bestätigte Abnahmefälle des ersten Moduls

1. „7.000 Franken“ nach Frage zum monatlichen Bruttolohn: passender unbestätigter Betragsvorschlag.
2. „Nein, ich meinte 7.500.“: alten unbestätigten Vorschlag ersetzen.
3. „Mein Partner verdient 6.000.“: Person nur bei eindeutiger Zuordnung wählen; fehlende Periode/Basis als Unklarheit behandeln.
4. „Monatlich und brutto.“ auf offene Rückfrage: Unklarheit auflösen und vollständigen Vorschlag erzeugen.
5. Doppelte Zustellung oder Modellfehler: keine Duplikate oder beschädigten Zustände.

Nur Fall 1 passt bereits zum eng begrenzten Betragsvorschlagsweg. Die weiteren Fälle benötigen teilweise die mit Valentin abzustimmenden Erweiterungen. Abnahmefälle sind bestätigt, nicht ausgeführt.

## Abschlussstatus

**Abgeschlossen durch nachfolgende Nutzerklärung:** Maßgeblich ist die
[Integrationsvereinbarung](integration-agreement.md). Sie bestätigt den Anschluss
im selben Nest-Prozess, den synthetischen Modellkontext und die Zuständigkeiten.
Sie ersetzt den ursprünglichen Monatsbrutto-Test durch 119.000 CHF Jahresbrutto
für person_demo_1 (11.900.000 Rappen im Versicherungsfeld; Budget-Netto unverändert).
Valentin übernimmt Bestätigungsanforderungen und abgeleiteten Gesprächsstatus,
Earnie Extraktion/Modellanbindung, Dario Voice-Zuordnung.

### Neuer Code-Stand nach Nutzer-Pull

Main steht inzwischen auf f1048c2 (Advisor-Verträge, Mock und CaseStore).
Die lokal vorhandene Backend-Referenz steht auf 563a187 und implementiert
inzwischen Extraktionskontext, atomare Pakete, Ersetzung offener Pakete und
persistente Unklarheiten. Die oben dokumentierten Lücken von bdddd8e sind
historische Befunde und für diesen neueren Branch teilweise überholt.
Kein Checkout/Merge oder Ausführen des Backends erfolgt.

Aktueller Fragenkatalog: [Fragen an Valentin](questions-for-valentin.md).
Insbesondere Auflösung von Unklarheiten erst bei Kundenaktion, zweistufige
Bestätigung, Einkommenssemantik und Frontend-/Backend-Adapter sind abzustimmen.

Entscheidungsrunden Q1–Q32 und abschließende Teamklärung beantwortet.
Gemeinsames Verständnis bestätigt. Konkreter Integrationszeitpunkt und Startmodell
werden beim Umsetzungsstart geprüft; keine Implementierung durch diese Notizen vorgenommen.

## Lokaler Workflow

- Freigegebene Konfiguration in AGENTS.md und docs/agents/ eingerichtet.
- Persönliche Konfiguration, .scratch, Glossar und ADRs über .git/info/exclude lokal ausgeschlossen.
- Keine externen Issues, Commits oder Pushes beauftragt.

## Noch offen

- Konkretes erstes Feldset und verbindliches Runtime-Schema mit Valentin.
- Übergabeformat des Dialogs, IDs, Revisionen und Regeln bei verspäteten Ergebnissen.
- Korrekturen, Verneinungen und Widersprüche gegenüber bestehenden Vorschlägen/bestätigten Angaben.
- Owner für Bestätigungsaktion, kanonischen Fall und Persistenz.
- Übergabe der Unklarheiten an Dario: automatisches Rückfragen-Timing oder Auswahl durch Live-Agent.
- Konkretes Startmodell, Backend-Sprache/Stack und erster Integrationstermin.
- Latenzziel und Abnahmebeispiele.

## Quellen

- [Research: OpenAI-Extraktionsflow](research/openai-extraction-flow.md)
- [Team-Schnittstellen](../../documentation/baselhack/plans/interface-contracts.md)
- [Gemeinsamer Datenvertrag](../../documentation/baselhack/plans/implementation-plan.md#8-gemeinsamer-datenvertrag)
