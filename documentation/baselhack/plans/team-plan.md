# Pax LifeMap – Arbeitsaufteilung für fünf Personen

Stand: 30.10.2026. Die Personenbezeichnungen sind Rollenplätze, bis ihr Namen und Stärken zuordnet. Es wurden keine Aufgaben in GitHub erstellt und noch keine App-Funktionen implementiert.

## Gemeinsames Ziel

Ein gespeicherter Kundenfall durchläuft Bedarfsaufnahme, Analyse aller drei Säulen, die Szenarien Familie/Eigenheim/Pensionierung, eine nachvollziehbare Empfehlung und den Ablauf bis zur ausdrücklich als Demo gekennzeichneten Police. Der fachliche Gesamtplan steht in [PAX_DIGITAL_ADVISOR_PLAN.md](./advisor-plan.md).

## Fünf Verantwortungsbereiche

| Person | Verantwortung | Erstes eigenständig lieferbares Ergebnis | Übergabe an das Team |
|---|---|---|---|
| 1 | Frontend und UX | Bestätigbares Profil und LifeMap mit drei Szenarioansichten auf festen Beispieldaten | Ansichten, Zustände für fehlende Daten/Fehler und Darstellung des Beratungsdossiers |
| 2 | Datenmodell, Finanzlogik und Logismata | Validierter Serveradapter für Risiko und Pensionierung mit den archivierten Beispielen | Versionierte Berechnungsergebnisse, Einheiten, Datenstatus sowie transparentes Eigenheim-/Ereignismodell |
| 3 | AI-Dialog und Empfehlungen | Strukturierte Bedarfsaufnahme, gezielte Rückfragen und Erklärungen auf festem Rechenergebnis | Nachvollziehbare Produktregeln, Quellenverweise, Alternativen und Auslöser für menschliche Prüfung |
| 4 | Fallpersistenz, Antrag und Portal | Fall speichern/wiederaufnehmen; Offerte und Antragsstatus bis zur Sandbox-Police | Klare Adaptergrenzen, Statusübergänge, Wiederaufnahme und sichere fallbezogene Berechtigungen |
| 5 | Fachliche Qualität, Integration und Demo | Getrennter Persona-/Referenzdatensatz, Pax-Fragenliste und gemeinsame Abnahmekriterien | Prüfung von Angemessenheit, Zeitverlauf und Datenschutz, Integrationsdurchlauf, Demo und Pitch |

Person 5 koordiniert die fachliche Abstimmung und die Abnahme; die Verantwortung für korrekte Umsetzung bleibt bei allen. Sicherheits- und Datenschutzanforderungen werden in jeder Spur umgesetzt, nicht erst am Ende geprüft.

## Schnittstellen zuerst gemeinsam festlegen

Innerhalb der ersten zwei Stunden ein kleines gemeinsames Beispieldokument vereinbaren:

- `Household` und `Person`: stabile IDs, Beziehungen und getrennte persönliche Angaben.
- Geldwerte: CHF, Jahr/Monat, Brutto/Netto und Herkunft; fehlende Werte ausdrücklich als unbekannt.
- `Scenario`: Typ, geänderte Annahmen, Profilversion und Zeitpunkte.
- `CalculationRun`: ID, Eingabeversion, Operation, Antwortstatus, Datenstand, Ergebnisse und Unsicherheiten.
- `Recommendation`: Ziel, relevanter Bedarf, referenzierte Rechenläufe, Regel-/Produktversion, Alternative und offene Prüfung.
- `Case`: aktueller Status sowie Verweise auf Dossier, Offerte, Antrag und gegebenenfalls Demo-Police.

Diese Bezeichnungen sind der vereinbarte Ausgangspunkt, keine bereits vorhandenen APIs. Beispiel-JSONs und Schemaindex stehen unter [references/api/](../references/api/).

## So können die fünf Spuren gleichzeitig vorankommen

1. Person 1 baut die Oberflächen zunächst mit demselben synthetischen Datensatz, den Person 2 für den Adapter verwendet.
2. Person 3 arbeitet mit festen, nachvollziehbaren Rechenergebnissen. Der Dialog darf weder Preise noch Leistungen erfinden.
3. Person 4 implementiert den gespeicherten Fall und die späteren Statusschritte unabhängig davon, ob Pax eine Sales-API bereitstellt.
4. Person 5 trennt die bereitgestellten Personas von den ausgefüllten Referenzanalysen und klärt Annahmen mit den Pax-Experten.
5. Sobald Person 2 echte Adapterantworten liefert, werden dieselben Daten in Frontend, Erklärdienst und Dossier verwendet.

## Gemeinsame Integrationspunkte im 48-Stunden-Fenster

| Zeitpunkt | Gemeinsamer Nachweis |
|---|---|
| Nach 2 h | Rollen, ein Demo-Fall, Datenvertrag, Modellfreigabe und offene Integrationsgrenzen vereinbart |
| Nach 8 h | Profil speichern, erste Berechnung abrufen und das Ergebnis in LifeMap anzeigen |
| Nach 20 h | Alle drei Szenarien auf demselben Fall durchlaufen; fehlende Angaben und Fehler behandeln |
| Nach 30 h | Erklärbare Empfehlung und menschliche Übergabe aus demselben Beratungsdossier zeigen |
| Nach 38 h | Empfehlung → Offerte → Antrag → Sandbox-Prüfung → fiktive Police ohne Datenneuerfassung |
| Nach 44 h | Fachliche Grenzfälle, API-Ausfall, Berechtigungen und Demo-Ablauf geprüft |
| Restliche Zeit | Fehlerkorrektur, verständliche Darstellung und Drei-Minuten-Pitch |

Das sind Zeitpunkte im gemeinsamen Arbeitsfenster, nicht 48 Stunden Aufwand pro Person. Teamtempo und tatsächliche Hackathon-Zeiten müssen berücksichtigt werden.

## Erste konkrete Arbeitspakete

### Person 1 – Frontend/UX

- [ ] Ziele und Haushaltsbild vor Produktauswahl darstellen.
- [ ] Bestätigte, geschätzte und unbekannte Angaben unterscheidbar machen.
- [ ] Familie, Wohneigentum und Pensionierung mit Vorher-/Nachher-Vergleich anzeigen.
- [ ] Zeitliche Versorgungslücken und verbleibende offene Fragen sichtbar machen.
- [ ] Empfehlung, Dossier, Antragsstatus und Portalansicht verbinden.

### Person 2 – Berechnung und Daten

- [ ] JSON-Vertrag und Validierung mit Person 4 abstimmen.
- [ ] Logismata nur serverseitig ansprechen; Token nicht in Client oder Logs ausgeben.
- [ ] Risiko-`ErrorCode` 0 gegenüber Swagger-OK 1 mit Pax/Logismata klären.
- [ ] 3. Säule, Liquidität und bestehende Deckungen ohne Doppelzählung integrieren.
- [ ] Grenzen zeitabhängiger Kinderleistungen und der Eigenheimrechnung ausdrücklich behandeln.

### Person 3 – AI und Empfehlungen

- [ ] Angaben in ein bestätigbares Schema überführen und die nächste relevante Rückfrage auswählen.
- [ ] Erklärungen ausschließlich auf freigegebene Fakten, Berechnungen und Produktmerkmale stützen.
- [ ] Bedarf, Alternative, Einschränkungen und Datenlücken vor einer Produktempfehlung erklären.
- [ ] Persönliche Angemessenheit von gemeinsamer Haushaltsplanung trennen.
- [ ] Menschliche Prüfung und „keine zusätzliche Versicherung angezeigt“ als echte Ergebnisse zulassen.

### Person 4 – Fall, Antrag und Portal

- [ ] Persistenz und Zugriff auf genau den berechtigten Kundenfall implementieren.
- [ ] Profile, Szenarien, Rechenläufe und Empfehlungen versioniert verknüpfen.
- [ ] Quote-, Antrags- und Policenadapter als getrennte Übergabepunkte definieren.
- [ ] Antrag, Annahme und Police als unterschiedliche Status darstellen.
- [ ] Fehlende Pax-Integration durch einen sichtbaren Sandbox-Adapter abdecken, keine reale Ausstellung behaupten.

### Person 5 – Fachprüfung und Demo

- [ ] Synthetische Persona-Ergänzungen und unveränderte Referenzfälle getrennt dokumentieren.
- [ ] Wartefristen, Krankheit/Unfall, Ende von Kinderleistungen und gestaffelte Pensionierung prüfen.
- [ ] Aktuelle Bedingungen, offizielles Angemessenheitsformular und Integrationsfreigaben mit Pax abgleichen.
- [ ] Mit allen Rollen gemeinsam die Abnahmeliste im Gesamtplan durcharbeiten.
- [ ] Demo mit genau einem durchgängigen Fall vorbereiten und den tatsächlichen Funktionsumfang korrekt präsentieren.

## Arbeit im Repo

- Kleine fachlich zusammenhängende Branches und Pull Requests verwenden; Schnittstellenänderungen mit den betroffenen Rollen abstimmen.
- Die bestehende Struktur `code/`, `assets/` und `documentation/` bleibt der Ausgangspunkt. Framework und Modulstruktur gemeinsam vor dem ersten App-Slice festlegen.
- In diesem Paket funktionieren Quellenlinks relativ zum Checkout. Keine absoluten persönlichen Dateipfade in neue Repo-Dokumente übernehmen.
- Originalquellen unverändert lassen. Änderungen gehören in Produktregeln, Fallmodelle oder neue Notizen mit Quellenbezug.
- Das Zugangsdaten-Beispiel [logismata.env.example](../logismata.env.example) enthält keinen echten Token. Autorisierte lokale Zugangsdaten gehören ausschließlich nach `private/logismata.env`, mit Dateirechten `0600`.
- `private/` und generierte `exports/` werden nicht eingecheckt. Zugangsdaten über den freigegebenen Teamweg beziehen, nicht über Git verteilen.

## Was bei Zeitknappheit bleibt

Erhalten bleiben alle drei Szenarien, das vollständige finanzielle Bild und der gespeicherte Ablauf bis zur Demo-Police. Zuerst Anzahl zusätzlicher Produkte, Avatar, Voice und Gestaltungsdetails reduzieren. Niemand beginnt einen zusätzlichen Spezialfall, solange der gemeinsame Hauptfall noch nicht vollständig durchläuft.

## Ergänzung aus dem öffentlichen Referenztest

Der [Testbericht zur aktuellen Pax/vlot-Analyse](../reports/public-pension-analysis.md) gehört zur gemeinsamen Vorbereitung. Die öffentliche Lösung bietet bereits Familienprofil, Säulen-/Steuerbetrachtung und PDF-Export. Person 1 zeigt den zusätzlichen Szenariovergleich, Person 2 versioniert Rechenannahmen, Person 3 hält Ergebnis und Empfehlung konsistent, Person 4 führt den Fall bis zur Demo-Police fort, Person 5 klärt die beobachtete Risikolücken-Abweichung und den PDF-Entwurfsstatus mit Pax. Die synthetische Testauswertung ist kein bestätigter fachlicher Sollwert für Logismata.
