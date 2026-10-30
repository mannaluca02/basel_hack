# Pax LifeMap – Workshop-Entscheide und Übernahme in den Plan

**Fortschreibung: 31.10.2026.** Grundlage sind die vom Nutzer bereitgestellten Whiteboard-Fotos `IMG_7232.HEIC` (UI/Rollen/Features) und `IMG_7233.HEIC` (Workflow/Schnittstellen). Das tatsächliche Workshopdatum wurde nicht aus dem Foto abgeleitet. Namen/Zuständigkeiten und Fortschritt direkt am Agenten wurden anschließend ausdrücklich vom Nutzer bestätigt.

Dieses Dokument trennt lesbare Board-Inhalte, bestätigte Auslegung und konkrete Umsetzungsvorschläge. Die ausführliche Umsetzung steht im [Detailplan](implementation-plan.md); Arbeitspakete und Aufwand im [Workshop-Backlog](implementation-backlog.md).

## 1. Bestätigte Aufgabenverteilung

| Name | Workshop-Bereich | Bestätigung |
|---|---|---|
| Luca | UI | Nutzer bestätigt; der frühere UI-Eintrag Earnie ist auf dem Foto durchgestrichen |
| Lukas | Avatar | Nutzer bestätigt |
| Dario | Voice | Nutzer bestätigt |
| Valentin | Logik-Backend | Nutzer bestätigt |
| Earnie | KI-Backend | Nutzer bestätigt, einschließlich Schreibweise |

Ein dedizierter sechster QA-/Integrationsowner existiert nicht. Jeder Bereich prüft seine Funktion, gemeinsam prüft das Team den Gesamtfluss. Die zusätzliche Verteilung von gemeinsamem Backend-Grundgerüst, Persistenz, Sicherheit und Vertragsstatus ist ein Umsetzungsvorschlag: Earnie verantwortet die gemeinsame KI-/Session-/Fallgrundlage, Valentin die Fachverträge, Rechen- und Statusregeln. Das Board entscheidet nicht über zwei getrennte Backend-Prozesse.

## 2. Lesbare Features und Priorisierung

| ID | Board-/Nutzerinhalt | Einordnung im aktualisierten Plan |
|---|---|---|
| W01 | Opener fragt nach verfügbarer Zeit, Pfeil zu „Tempo“ | P0-Vorschlag: Zeitbudget und Gesprächsdetailgrad speichern; Pflichtdaten/-prüfungen bleiben gleich |
| W02 | „Dynamic View“, Zeitachse und Grafik; separate Produktfläche | P0: grafikzentrierter Workspace; Produktfläche fachlich gesperrt bis Bedarfsreife |
| W03 | Tabs: Progress, Graphics, Chat, Info, Summary | P0: genau diese fünf primären Ansichten; ein gemeinsamer Fall und Auswahlkontext |
| W04 | Progress am Agenten; Farbe/Ring durch Nutzer bestätigt | P0: Erfassungsfortschritt direkt am Agenten, getrennt von Risikostatus |
| W05 | „Dynamic graphics“ | P0: echte berechnete Änderungen und Zeit-/Personenauswahl; nicht dekorative Diagramme |
| W06 | Summary-Export an Fachperson und „Candidate“ | P0: Kunden-/Fachpersonensicht desselben Snapshots; Download statt automatischer Kommunikation |
| W07 | Agent erklärt Spezifisches, wenn etwas nicht verstanden wird | P0: „Diese Stelle erklären“ mit Grafik, Kennzahl, Periode, Person und Run-Version |
| W08 | „Video Avatar (Nice to have)“ | P1: optionaler Video-Renderer; grundlegender Agent/Progress bleibt davon unabhängig |
| W09 | Voice als bestätigter eigener Aufgabenbereich | P0-Vorschlag: dünner freigegebener STT-/TTS-Pfad mit durchgängigem Textfallback |
| W10 | „Follow up / Overview“ in Klammern | Vorläufig P1; erweiterte Fallübersicht/Weiterarbeit. Keine bestätigte Versand-/Reminderfunktion |
| W11 | Mondsymbol in der UI-Skizze | Nur Interpretation: möglicher Dark Mode. P2 bis ausdrücklicher Priorisierung |

Die P0-Einstufung der grundlegenden Sprach-/Agentintegration ist eine konkrete Umsetzungsempfehlung aus der bestätigten Bereichsaufteilung, keine zusätzlich behauptete Whiteboard-Abstimmung. Bei fehlender Speech-Freigabe bleibt Voice als offener Punkt sichtbar. Der Textfallback darf nicht als fertig implementierter Sprachkanal verkauft werden.

## 3. UI-Lesart

Die Hauptfläche zeigt Zeit/Grafik. Eine seitliche Leiste bietet Fortschritt, Chat/Information/Zusammenfassung und den Agenten; die separate Produktskizze bleibt eine sekundäre Fläche. Die zweite große Grafikskizze mit Avatar darunter unterstützt eine responsive Variante. Die genauen Abstände und Breakpoints sind nicht entschieden.

```text
+----------------------------------+--------------------+----------------------+
| Dynamic View                     | Progress / Graphics| Produkte, sobald     |
| Zeitachse und aktuelle Grafik    | Chat / Info        | fachlich passend     |
| Person + Szenario + Periode      | Summary            | und begründet        |
| Erklärbare Tabelle / Details     | Agent mit Ring     |                      |
+----------------------------------+--------------------+----------------------+
```

Die genaue Bedeutung einzelner gezeichneter Kurven, Schraffuren und der „Risk“-Beschriftung ist nicht eindeutig festgelegt. Deshalb setzt der Plan eine fachlich beschriftete Legende voraus und erfindet keine beschlossene Farbcodierung für Säulen oder Risikoklassen. Die Jahre 2026/2045 sind Skizzenwerte, keine harte Obergrenze der Vorsorgeplanung. Die gezeichneten Dreieck-/Kreis-/Menütasten werden nicht ungefragt zu zusätzlichen App-Funktionen erklärt.

## 4. Offene Begriffe und Umsetzungsvorschläge

- „Candidate“ wird vorläufig als Kundin/Kunde bzw. interessierte Person verstanden. Empfängerbezeichnung und tatsächlicher Übergabekanal bleiben offen; kein automatischer Versand wird daraus abgeleitet.
- Ein Zeitbudget beeinflusst Erklärungslänge, Fragebündelung und optionale Vertiefung. Die konkreten Minuten-Presets sind ein Entwurf, nicht auf dem Foto beschlossen.
- Fortschritt am Agenten beschreibt Aufnahme/Arbeitsstand. Hundert Prozent bedeutet weder „ausreichend versichert“ noch „Police aktiv“.
- Follow-up/Overview wird von der notwendigen Wiederaufnahme und dem P0-Portalstatus unterschieden. Eine zusätzliche Übersicht ist eine Erweiterung.
- Grundlegender Agent bedeutet zunächst eine einfache zustandsabhängige Darstellung. Weder 3D noch Videoanbieter noch Kameranutzung sind beschlossen.
- Angular bleibt die zuvor ausdrücklich getroffene Stack-Entscheidung. Backend-Stack und physische Aufteilung sind weiterhin technische Vorschläge.

## 5. Was sich gegenüber dem vorherigen Plan ändert

Die generischen Rollen Person 1–5 werden durch die bestätigten Namen/Bereiche ersetzt. Eine linke Chat-Hauptspalte und 16 vermeintlich getrennte Seiten werden durch einen grafikzentrierten Workspace mit fünf Ansichten ersetzt; die fachlichen Schritte bleiben als Karten/Dialogs/Status erhalten. Tempo, GraphContext, Agentprogress und zwei Summary-Sichten bekommen konkrete Verträge und Tests.

Voice und grundlegender Agent stehen als eigene Arbeitsspuren im Kernplan. Nur der Video-Avatar bleibt ausdrücklich Nice-to-have. Die drei Szenarien, alle drei Säulen, Datenschutz, Quellen-/Versionsbezug und der klar simulierte Vertragsweg bleiben erhalten. Die gesamte Produktpalette wird weiterhin nicht vor der Lebenssituation priorisiert.

Das Backlog wird neu zugeschnitten, nicht nur umbenannt. Seine JSON-Fassung enthält eine Zuordnung aller 36 alten Tickets zu den neuen Workshop-Tickets. Zeitansätze sind neue Schätzungen; sie sind keine Workshop-Zusagen und starten nicht erneut ein 48-Stunden-Budget.

## 6. Quellenschutz und Status

Das Originalfoto bleibt unverändert lokal. Es wird weder als HEIC noch als vollständige konvertierte Aufnahme in Git kopiert. Der [Quellennachweis](../catalog/workshop.json) hält Dateiname, SHA-256, bestätigte Aussagen und verbleibende Interpretationen fest. Ungefragte Bild-Metadaten oder erkennbare Umgebung werden nicht als Projektressourcen veröffentlicht.

Die Übernahme dieser Entscheidungen ist abgeschlossen; die App-Implementierung ist dadurch nicht erledigt. Neue Tickets bleiben auf geplant. Eine Nachricht an Fachpersonen, ein Upload zu Avatar-/Speechanbietern oder eine Mikrofon-/Kameranutzung wird in diesem Planungsschritt nicht durchgeführt.

## 7. Ergänzter Workflow aus dem zweiten Foto

Das zweite Foto konkretisiert Nutzer ↔ Dario, Dario → Earnie als „Voice Log“, den strukturierten Übergabestand mit Earnie/Valentin/Rückgabe zu Dario, Valentin → Luca als „Result“ und Dario → Lukas. Die [Schnittstellenspezifikation](interface-contracts.md) definiert daraus zehn geplante Nachrichtenverträge mit Versionen, Fehlern, Abbruch und synthetischen Beispielen. Der Nutzer hat anschließend „eher gemeinsame json“ bestätigt und nach der dynamischen Einbindung in Darios Gespräch gefragt. Geplant ist ein gemeinsamer versionierter JSON-Fallstand; HTTP/SSE und die Speichertechnik sind weiterhin Umsetzungsvorschläge.

Eine Finanzberechnung stammt von Valentin, eine verständliche Antwort von Earnies Advisor; Dario spricht denselben Inhalt und meldet reale Audioereignisse an Lukas. Luca zeigt die passende Ergebnisversion. Das Vorschlagsmodell ergänzt technische Schutzregeln, die auf dem Foto nicht ausgeschrieben sind, ohne sie als bereits beschlossene oder implementierte Schnittstellen auszugeben. Das zweite Originalfoto und seine Metadaten werden ebenfalls nicht in Git kopiert.

## 8. Bestätigter JSON-Fallstand und dynamische Voice-Anbindung

Die gemeinsame JSON ist die fachliche Quelle. Earnies Fallservice erzeugt daraus einen minimalen, versionierten AdvisorContext; Dario lädt ihn beim Einstieg, nach Änderungen und vor fachlichen Antwortturns. Vorgeschlagene SSE-Ereignisse melden neue Stände. Veraltete finanzielle Audioantworten werden abgebrochen; reine Darstellungs-/Tempoänderungen widerrufen keine gültigen Fachzahlen. Abschnitt 9 der [Schnittstellenspezifikation](interface-contracts.md#9-gemeinsame-json-und-dynamischer-gesprächskontext-für-dario) enthält Ablauf, Endpunkte, Tool-Option und Reconnect-Verhalten. I10 ergänzt die bisherigen neun Übergaben; die 37 Tickets bleiben bestehen.
