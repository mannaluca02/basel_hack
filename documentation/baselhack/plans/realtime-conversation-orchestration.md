# Verlässliche Echtzeit-Gesprächsführung und fachliche Orchestrierung

Status: ready-for-agent
Datum: 2026-11-01
Version: 1.0
Typ: Implementierungsspezifikation für das Team
Grundlage: Analyse der Voice-Debug-Session 94bcfb4c-70eb-4f92-8bf7-f9104ea7a72d und anschliessend besprochene Lösungsansätze.
Testentscheidung: Nutzer wünscht stärkere direkte Modultests, ergänzt durch authentifizierte HTTP-Integration und gerenderte Browserabläufe.

## Problem Statement

Die Person kann mit Paxi sprechen, erlebt aber keinen zuverlässigen Übergang von ihrer Aussage zu einem nachvollziehbaren Feldvorschlag, einer bestätigten Angabe und einer darauf beruhenden Berechnung. Sprachliches Verständnis, sichtbarer Erfassungsstand und verbindlicher Fallstand können auseinanderlaufen. Paxi kann bereits Produkte, Berechnungen oder nächste Schritte ankündigen, obwohl deren Voraussetzungen fehlen.

Die untersuchte Session belegt insbesondere:

| Befund | Nachweis | Auswirkung |
| --- | --- | --- |
| Flexibilitätswunsch wird als hohe Risikobereitschaft vorgeschlagen | „Möglichst viel Flexibilität“ ergibt `risk_appetite: high` | Fachlich unbegründete Klassifikation |
| Erkanntes Pensum verschwindet | 120 Prozent erkannt, im Mapping abgelehnt, keine Rückfrage und kein Issue im Ergebnis | Gespräch und Erfassungsstand widersprechen sich |
| Klare Pensionierungsangabe wird wieder unklar | 60 ist vorgeschlagen; „Nichts“ auf die Zusammenfassung erzeugt eine neue Unklarheit | Ein korrektes Gespräch verschlechtert den sichtbaren Stand |
| Schätzung wird erfragt und anschliessend blockiert | Wohnkosten 1'500 monatlich werden wegen `approximate` nicht vorgeschlagen | Natürliches Antworten passt nicht zur Verarbeitung |
| Fachlicher Fortschritt wird vorgetäuscht | Produktnennung und Berechnungsankündigung bei null bestätigten Profilen und null Berechnungsläufen | Falsche Erwartungen an das Ergebnis |
| Diagnose bricht vor Gesprächsende ab | Server-Relay erreicht Kapazität; 31 serverseitig offene Schritte haben abgeschlossene Browseranfragen | Fehlende Nachweise werden mit laufender Verarbeitung verwechselt |
| Aktualisierungen vervielfachen sich | 1'391 browserseitige GET-Anfragen in knapp zehn Minuten | Unnötige Last und übergrosser Debug-Datenbestand |

Die Beispiele belegen beobachtetes Verhalten. Sie belegen weder hörbare Audioqualität noch eine bestimmte Ursache für Sprechpausen. Der Export enthält keine dafür ausreichende Audiomessung. Späte serverseitige Modellantworten fehlen teilweise wegen des Aufzeichnungslimits.

## Solution

Die bestehende Anwendung erhält ein zentrales Gesprächs-Orchestrierungsmodul. Es führt den fachlichen Gesprächsfortschritt, behandelt Unklarheiten und liefert eine gemeinsame Projektion für Oberfläche und Sprachsteuerung. Die bestehenden Fall-, Übernahme-, Profilbestätigungs- und Berechnungsmodule bleiben für ihre jeweiligen verbindlichen Entscheidungen zuständig.

Die Person kann natürlich antworten und sieht, ob eine Angabe exakt, geschätzt, vorgeschlagen, übernommen oder noch zu klären ist. Eine relevante Angabe erhält immer einen nachvollziehbaren Ausgang. Rückfragen beziehen sich auf konkrete offene Punkte. Paxi führt bei ausreichenden Angaben zur tatsächlichen Bildschirmprüfung und kündigt Ergebnisse erst ihrem wirklichen Zustand entsprechend an.

Die Umsetzung erfolgt als modularer Monolith im vorhandenen Backend und in der bestehenden Web-/Debugging-App. Audio bleibt für gewöhnliche Unterhaltung im vorhandenen Echtzeitpfad. Fachliche Entscheidungen und überprüfbare Statusmeldungen stammen aus der Anwendung.

### Verbindlicher Umfang der ersten Umsetzung

- Alle acht bestehenden Intake-Felder, inklusive Schätzungen, Korrekturen und Klärungen.
- Persistenter, fall- und personengebundener Gesprächszustand mit Herkunftsnachweisen.
- Bildschirmbasierte Annahme von Änderungen und separate Bestätigung des Gesamtprofils.
- Voraussetzungen für Berechnung und persönliche Empfehlung sowie korrekte Ergebnisanzeige.
- Versionierte Gesprächsbeiträge, kontrollierte asynchrone Verarbeitung und Wiederverbindung.
- Gemeinsame UI-Projektion, gebündelte Lesezugriffe und belastbare Debug-Aufzeichnung.
- Direkte Modultests sowie HTTP-, Browser- und getrennte Modellqualitätsprüfungen.

## User Stories

1. Als antwortende Person möchte ich in Alltagssprache antworten, damit ich keine technischen Satzmuster kennen muss.
2. Als antwortende Person möchte ich einen Betrag schätzen dürfen, damit ich ohne Unterlagen sinnvoll fortfahren kann.
3. Als antwortende Person möchte ich erkennen, dass eine Schätzung keine exakte Zahl ist, damit ich ihre Verwendung bewusst prüfen kann.
4. Als antwortende Person möchte ich für eine nicht unterstützte Angabe eine verständliche Rückfrage erhalten, damit meine Antwort nicht verschwindet.
5. Als antwortende Person möchte ich zwischen vertraglichem Pensum und tatsächlicher Arbeitsbelastung unterscheiden können, damit „120 Prozent“ richtig eingeordnet wird.
6. Als antwortende Person möchte ich Flexibilität unabhängig von meiner Risikobereitschaft ausdrücken können, damit keine falsche Anlagepräferenz entsteht.
7. Als antwortende Person möchte ich eine Angabe korrigieren können, damit die neuere Aussage die ältere nachvollziehbar ersetzt.
8. Als antwortende Person möchte ich auf eine Zusammenfassung „Nichts“ antworten können, ohne richtige Angaben zu verlieren.
9. Als antwortende Person möchte ich kurze Antworten geben können, damit das Gespräch natürlich bleibt.
10. Als antwortende Person möchte ich sehen, welche Angaben noch Vorschläge sind, damit ich sie nicht mit bestätigten Angaben verwechsle.
11. Als antwortende Person möchte ich Änderungen ausdrücklich übernehmen, damit das Unterhaltungslog nicht selbst meinen Fall verändert.
12. Als antwortende Person möchte ich das Gesamtprofil separat bestätigen, damit ich die Berechnungsgrundlage bewusst freigebe.
13. Als antwortende Person möchte ich bei fehlenden Angaben gezielt zur nächsten notwendigen Frage geführt werden.
14. Als antwortende Person möchte ich eine Frage auslassen können, damit das Gespräch meine Entscheidung respektiert.
15. Als antwortende Person möchte ich Informationen zu einer Lösung erhalten, bevor ich einen Favoriten festlege.
16. Als antwortende Person möchte ich meinen Favoriten mit erkennbarem Status festhalten können, ohne dadurch einen Vertrag oder eine verbindliche Empfehlung auszulösen.
17. Als antwortende Person möchte ich wissen, ob eine Berechnung fehlt, läuft, fertig oder veraltet ist.
18. Als antwortende Person möchte ich keine zugesagte Kontaktaufnahme hören, die tatsächlich nicht arrangiert wurde.
19. Als antwortende Person möchte ich Paxi unterbrechen können, ohne dass eine halbe Frage als vollständig präsentiert gilt.
20. Als antwortende Person möchte ich nach einer Unterbrechung oder Wiederverbindung meinen tatsächlichen Gesprächsstand wiedersehen.
21. Als antwortende Person möchte ich das digitale Gespräch sofort stoppen oder übergeben können, auch wenn eine Extraktion läuft.
22. Als antwortende Person möchte ich verständlich erfahren, wenn Verarbeitung oder Synchronisierung nicht funktioniert.
23. Als entwickelnde Person möchte ich den Orchestrator direkt mit kontrollierten Eingaben testen, damit fachliche Entscheidungen ohne Browser und Live-Provider reproduzierbar sind.
24. Als entwickelnde Person möchte ich verspätete, doppelte und widersprüchliche Ereignisse reproduzieren können.
25. Als entwickelnde Person möchte ich Herkunft, Interpretation und Übernahme jeder Angabe unterscheiden können.
26. Als entwickelnde Person möchte ich eine normale Session vollständig fachlich untersuchen können, ohne dass wiederholte Snapshots die Diagnose verdrängen.
27. Als entwickelnde Person möchte ich fehlende Abschlussnachweise von wirklich laufenden Aufgaben unterscheiden können.
28. Als entwickelnde Person möchte ich Modellfehler von Integrationsfehlern und fachlich erlaubter Unsicherheit unterscheiden können.
29. Als entwickelnde Person möchte ich Aktualisierungen gemeinsam laden, damit eine Änderung keine mehrfachen vollständigen Reloads auslöst.
30. Als entwickelnde Person möchte ich echte Modellqualität getrennt von deterministischer Korrektheit bewerten können.
31. Als entwickelnde Person möchte ich alte Debug-Exporte weiter öffnen und bestehende Fälle weiter laden können.
32. Als fachlich prüfende Person möchte ich verbleibende Annahmen und offene Punkte sehen, damit ich Demo-Grundlagen nicht als Angaben der Person behandle.

## Implementation Decisions

### D01 – Zuständigkeiten und Architektur

Es entstehen keine zusätzlichen deploybaren Prozesse, kein Message-Broker und kein zweites fachliches Fallführungssystem.

Das Gesprächs-Orchestrierungsmodul verantwortet Fragebezüge, Beobachtungsergebnisse, Unklarheiten, Gesprächsphase, laufende Verarbeitung und nächste zulässige Gesprächsaktion. Es koordiniert die bestehenden Module für Erfassung, Feldvorschläge, Bestätigungsanforderungen, Berechnung und Übergabe.

Das verbindliche Fallmodul bleibt alleinige Autorität für den Entwurf, angenommene Änderungspakete, bestätigte Profilversionen und tatsächliche Berechnungsläufe. Der Orchestrator hält darauf Verweise, keine unabhängig veränderbare Kopie bestätigter Werte.

Der Browser verantwortet Audioein-/ausgabe, lokale Unterbrechung und Darstellung. Er entscheidet nicht unabhängig über fachliche Unklarheiten oder Übernahme. Sprachmodell und Extraktor liefern untrusted Eingaben, keine Schreibberechtigung.

### D02 – Kleines, direkt testbares Interface

Das zentrale schreibende Interface des Orchestrators ist die Verarbeitung einer typisierten Gesprächseingabe. Die Eingabe enthält stabile Aktion-ID, Fall, Zielperson, gegebenenfalls Voice-Session, Quellbeitrag und die erforderlichen Versionsbezüge. Authentisierte Aufrufer werden durch bestehende Module geprüft; Modelle und Browser dürfen keine internen Ereignistypen oder Actor-Rollen vortäuschen.

Die Eingabetypen umfassen: Beitrag abgeschlossen/korrigiert, Klärung ausgelassen, Review angefordert, echte Übernahme-/Profilbestätigung beobachtet, Berechnung angefordert, echtes Berechnungsergebnis beobachtet, Präferenz festgehalten, Übergabe und Sessionende. Interne Ergebnisse gelangen nur aus den jeweils zuständigen Modulen hinein.

Das Ergebnis umfasst Verarbeitungskennung, Ergebnisstatus, Gesprächsrevision, aktuelle Projektion, Beobachtungsausgänge und geordnete auszuführende Aktionen. Es umfasst insbesondere keine vom Aufrufer separat einzuhaltende Folge „erst Memory ändern, dann Entwurf lesen, dann Fragenstatus korrigieren“.

Intern werden fachliche Entscheidungslogik und ausführende Orchestrierung getrennt: Die Entscheidungslogik arbeitet synchron und deterministisch auf einem expliziten Zustand und liefert Entscheidungen. Die Orchestrierung führt Provideraufrufe und transaktionale Änderungen aus. Beide haben öffentliche Modul-Interfaces für direkte Verhaltenstests; private Hilfsfunktionen werden nicht zum Testvertrag.

Zeit und externe Provider sind explizite Abhängigkeiten. Bestehende Live- und Replay-Adapter werden wiederverwendet. Neue austauschbare Interfaces werden nur für tatsächlich verschiedene Implementierungen eingeführt.

### D03 – Persistenz und Revisionen

Der Gesprächszustand wird innerhalb des bestehenden verschlüsselten Fall-Speichers persistiert. Er gehört zum Fall, unterscheidet Zielpersonen und referenziert einzelne Voice-Sessions. Ein Sessionwechsel löscht weder Feldhistorie noch bestehende fachliche Klärungen.

Es gibt eine monotone Gesprächsrevision zusätzlich zu den bestehenden Fall-, Kontext-, Transkript- und Profilrevisionen. Gesprächsinterne Änderungen erhöhen nicht willkürlich die fachliche Fallrevision und invalidieren keine Bestätigungsanforderung allein wegen eines neuen Transkriptfragments. Projektionen nennen die jeweils verwendeten Revisionen.

Gesprächszustand und von ihm veranlasste Feldvorschläge werden bei ihrer Übernahme atomar im vorhandenen Transaktionsmodell geschrieben. Externe Aufrufe finden ausserhalb von Speichertransaktionen statt. Benachrichtigungen werden erst nach erfolgreichem Commit veröffentlicht. Ein verlorenes Live-Ereignis wird über Snapshot-Abgleich repariert; ein dauerhaftes Event-Sourcing-System ist nicht erforderlich.

### D04 – Datenmodell für Aussagen, Vorschläge und Bestätigungen

Eine Beobachtung enthält mindestens:

| Gruppe | Inhalt |
| --- | --- |
| Identität | Beobachtungs-ID, Fall, Zielperson beziehungsweise globaler Geltungsbereich |
| Bedeutung | Feld oder erlaubtes Gesprächsthema; normalisierter Wert |
| Einheit | Bei Geld Währung, explizite Minor-Unit und Periode; beim Einkommen zusätzlich brutto/netto |
| Qualität | exakt, geschätzt, Bereich oder unbekannt; keine Gleichsetzung mit Zustimmung |
| Herkunft | Kundenbeitrags-ID und Revision, wörtliches Zitat, ergänzende frühere Kundenbelege und zugehörige Frage |
| Verarbeitung | vorgeschlagen, Klärung erforderlich, Konflikt, nicht unterstützt, nicht relevant oder durch neuere Quelle ersetzt |
| Fachbezug | Änderungspaket und konkrete Änderung; gegebenenfalls Bestätigungsanforderung und bestätigte Profilversion |
| Aktualität | Ausgangsrevisionen, Ersetzungsbezug und Zeitpunkte |

Übernommene Werte werden aus den kanonischen Übernahmeentscheidungen projiziert. Eine Beobachtung behauptet nicht selbst, eine bestätigte Angabe zu sein. Annahme eines Änderungspakets und Bestätigung des Gesamtprofils bleiben verschiedene Aktionen gemäss Glossar.

Bei Profilbestätigung wird ein unveränderlicher Qualitäts-/Herkunftssnapshot für die konkrete Profilversion atomar mit deren Erstellung festgehalten. Spätere Korrekturen ändern diesen Nachweis nicht. Bestehende Rechenfelder behalten ihre numerischen Verträge; Annahmen und Schätzqualität werden über diesen versionsgebundenen Nachweis ergänzt und im Review/Ergebnis lesbar gemacht.

Die Feldhistorie erhält für jede mitgetragene Änderung ihren ursprünglichen Herkunftsnachweis. Ein kumulatives Änderungspaket darf nicht alle enthaltenen Angaben scheinbar auf den letzten Kundenbeitrag zurückführen. Die bestehenden Supersession-Regeln bleiben wirksam.

Demo-Ausgangswerte werden als Ausgangszustand gekennzeichnet. Ihre Existenz zählt nicht als im aktuellen Gespräch erfasst oder bestätigt.

### D05 – Feldregeln und Schätzungen

Der bestehende Katalog mit acht Intake-Feldern bleibt erhalten. Unterstützte Qualitäten werden pro Feld festgelegt:

| Feld | Verbindliche Regel |
| --- | --- |
| Jahresbrutto | CHF, Jahresbezug und Bruttobasis erforderlich; exakter oder ausdrücklich geschätzter Betrag ist vorschlagbar; Monatsnetto wird nicht umgerechnet |
| Beschäftigungsgrad | Vertragliches Pensum von 0 bis 100 Prozent; höhere Werte erzeugen Klärung zur Bedeutung statt stiller Ablehnung oder automatischem Kappen |
| Zivilstand/Beziehung | Unterstützte Beziehungsform erfragen; „ledig“ und „zusammenwohnend“ sind nicht automatisch widersprüchlich; der Zielwert des bestehenden Beziehungsfelds wird ausdrücklich geklärt |
| Pensionskasse | Vorhandensein ja/nein/noch unbekannt; nicht allein aus Beruf oder Lohn ableiten |
| 3a-Beitrag pro Jahr | Exakter oder geschätzter Jahresbetrag; „maximal“ begründet eine Rückfrage, keinen erfundenen gesetzlichen Höchstbetrag |
| Wohnkosten | CHF pro Monat, exakt oder geschätzt; bei unklarem Personen-/Haushaltsbezug Rückfrage |
| Wunschpensionierung | Ganzzahliges Alter innerhalb der bestehenden fachlichen Schema-Grenzen; Grenzen vor Vorschlagserstellung prüfen; Pensumsreduktion und vollständiger Arbeitsstopp unterscheiden |
| Risikobereitschaft | Keine Ableitung aus Flexibilität, Vermögen oder Einkommen; nur eine explizite Einstufung oder Antwort auf eine gebundene Frage mit ausdrücklich benannten, fachlich freigegebenen Optionen low/medium/high |

Eine allgemeine Aussage wie „Ich akzeptiere gewisse Schwankungen“ wird zunächst als Risikokontext gespeichert und erfordert zur Einstufung eine weitere Frage. Eine Verlustszenario-Antwort allein erhält in dieser Umsetzung keinen erfundenen Score. Eine vollständige Suitability-Prüfung wird dadurch nicht ersetzt.

Eine Schätzung kann als Feldvorschlag in die Bildschirmprüfung gelangen. Dort werden Wert, Qualität und Verwendung sichtbar. Übernahme macht aus einer Schätzung keinen exakten Wert. Für Berechnungen bleibt die Schätzung als Annahme an der bestätigten Grundlage nachvollziehbar.

Erlaubt das bestehende Berechnungsschema einen Bereich nicht, wird ein einzelner ausdrücklich gewählter Planungswert erfragt. Es wird weder automatisch der Mittelwert eingesetzt noch pauschal jede Unsicherheit abgelehnt.

Kontext darf Periode, Währung oder Bedeutung einer kurzen Antwort ergänzen, wenn der Fragebezug nach D07 belastbar ist. Ein ausdrücklich abweichender Kundenhinweis gewinnt. Frühere Assistentenbeispiele werden niemals zu Kundenwerten.

### D06 – Jeder Beobachtung ein erklärbarer Ausgang

Ein erkannter fachlicher Beitrag endet in genau einem sichtbaren Ausgang je Beobachtung: Feldvorschlag, konkrete Klärung, konkreter Konflikt, nicht unterstützte Weiterbehandlung, nicht relevant oder ersetzt/veraltet. Technische Fehler werden separat ausgewiesen.

Ein Mappingfehler darf nicht als leere erfolgreiche Extraktion erscheinen. Fachliche Grenzen erhalten feldspezifische Codes, etwa Pensum ausserhalb des unterstützten Bereichs oder Pensionierungsalter ausserhalb der Schema-Grenzen. Einheitenfehler bleiben von Bereichsfehlern unterscheidbar.

„Kein relevanter Inhalt“, „Modell nicht verfügbar“, „Angabe abgelehnt“ und „Angabe wird noch verarbeitet“ sind unterschiedliche Ergebnisse. Das letzte erfolgreiche Ergebnis darf einen späteren Infrastrukturfehler nicht unsichtbar machen.

Lokale Unklarheiten werden durch persistente Klärungsobjekte ersetzt. Eine Unklarheit benennt Feld, Grund, Herkunft, eine konkrete Frage und ihren Status. Sie wird durch eine passende Präzisierung oder ausdrückliche Entscheidung aufgelöst. Die Darstellung einer beantworteten Unklarheit folgt dem Glossar: passende Antwort vorhanden bedeutet Übernahmeentscheidung, nicht erneutes Fragen.

### D07 – Fragen und kurze Antworten

Ein Fragebezug enthält stabile ID, Art, betroffene Felder/Aktion, Frageinhalt, erwartete Antwortart, Ausgangsrevision und Präsentationsnachweis. Arten sind mindestens Informationsfrage, Klärung, Zusammenfassung und Bestätigungsanforderung.

Frei gesprochene Assistentenfragen sind zunächst beobachteter Gesprächskontext. Der Orchestrator darf daraus einen Fragebezug für Information/Klärung ableiten, muss dessen Herkunft und heuristische Zuordnung aber benennen. Ein solcher Bezug autorisiert keine Übernahme. Mehrere Fragen, Sprecherüberlappung oder eine unvollständige Frage ergeben bei fehlender Eindeutigkeit eine Rückfrage statt einer geratenen Zuordnung.

Eine Antwort „Nichts“ auf eine Zusammenfassung verändert keine bereits klare Angabe und löst keine Übernahme aus. „Ja“ zu einer bestimmten Präzisierung betrifft nur die benannten Felder. „Mhm“ während einer noch laufenden oder unterbrochenen Frage ist kein pauschales Akzeptieren ihres Inhalts.

Bestätigungsanforderungen werden ausschliesslich über den bestehenden gebundenen Bestätigungsablauf erzeugt. In dieser Umsetzung zählt für ihre Präsentation der tatsächlich angezeigte Bildschirm. Providertranskript, Browser-Ruhefenster und Output-Energiemessung gelten nicht als vollständige Wiedergabe.

### D08 – Gesprächsphase und nächste Aktion

Die fachlichen Phasen sind Erfassen, Klären, Bildschirmprüfung, Profilbestätigung, Berechnungsbereit, Berechnung läuft, Ergebnis verfügbar und digitale Unterhaltung gestoppt. Dies ist kein starrer Fragebogen: Korrekturen können in frühere Phasen zurückführen. Fachliche Phase und lokale Audio-/Verbindungsaktivität sind getrennte Zustände.

Die nächste Aktion wird deterministisch priorisiert:

1. Stop, Übergabe oder entzogene Berechtigung sofort behandeln.
2. Eine ausdrückliche Informationsfrage beantworten oder als noch nicht beantwortet halten.
3. Einen blockierenden Konflikt beziehungsweise die für den nächsten Schritt notwendige Klärung behandeln.
4. Weitere notwendige Angaben im Gesprächskontext erfragen.
5. Verfügbare Feldvorschläge zur Bildschirmprüfung anbieten.
6. Gesamtprofil separat bestätigen lassen und erst danach Berechnung anbieten.

Nur tatsächlich gestellte und beantwortungsrelevante Fragen zählen als Klärungsversuch. Smalltalk, „ähm“, Providerfehler und Antworten zu anderen Feldern erhöhen keinen Versuchszähler. Nach einer erfolglosen Klärungsnachfrage wird der Punkt offen zurückgestellt; eine ausdrückliche Ablehnung wird sofort respektiert. Wiederaufnahme erfolgt nur nach Nutzerinitiative oder bei einem ausdrücklich angeforderten, dadurch blockierten fachlichen Schritt.

Ein Zeitbudget beendet weder Fragen heimlich noch bestätigt es Angaben. Bei knappem Budget nennt Paxi offene Punkte und bietet Prüfung, Fortsetzen oder Übergabe an.

### D09 – Informationswünsche, Ziele und Präferenzen

Die acht Intake-Felder sind nicht die gesamte Gesprächserinnerung. Zusätzlich werden erlaubte Gesprächsnotizen für Ziele, Flexibilitätswunsch, Pensumsreduktion, Informationswunsch und ausgewählte Gesprächsrichtung gespeichert, jeweils mit Kundenquelle und Vorschlags-/Zustimmungsbezug. Sie verändern keine Rechenfelder und erfinden keine neue verbindliche Empfehlung.

„Ab 50 weniger arbeiten“ bleibt als Ziel erhalten und wird nicht mit „mit 60 vollständig aufhören“ überschrieben. „Mehr Informationen“ bleibt offen, bis eine Antwort mit verwertbarem Inhalt vorliegt oder die Person den Wunsch zurückzieht. Eine reine Zusage wie „Klar, gerne“ erfüllt ihn nicht.

Produktinformationen stammen ausschliesslich aus fachlich vorhandenen/freigegebenen Inhalten. Fehlen konkrete Aussagen zu Kosten, Liquidität oder Ausstieg, wird die Unkenntnis benannt; es werden keine Konditionen ergänzt. Die strukturierte Informationsantwort nennt Bedeutung, belegte Eigenschaften, offene Fragen und nächsten möglichen Schritt.

Eine Präferenz benötigt eine eindeutig bezeichnete Richtung und eine passende Zustimmung. „Ja gerne“ ohne eindeutigen Bezug löst eine Klärung aus. Die Speicherung ist sichtbar und bedeutet weder Vertragsabschluss noch geprüfte Eignung. Eine spätere Korrektur ersetzt die Präferenz mit Historienbezug.

### D10 – Fachliche Voraussetzungen und Ausgabegrenzen

Die Projektion enthält getrennte Möglichkeiten und Blocker für Bildschirmprüfung, Profilbestätigung, Berechnung und persönliche Empfehlung. Eine generische Vollständigkeitszahl ersetzt diese Regeln nicht.

- Bildschirmprüfung ist bei vorhandenen gültigen Vorschlägen möglich, auch wenn weitere Felder offen sind.
- Profilbestätigung setzt die vorhandenen fachlichen Vollständigkeits-/Konfliktregeln, die Prüfung der Angaben und sichtbare Annahmen voraus. Ausgelassene Felder werden nicht allein deshalb als vorhanden behandelt.
- Berechnung setzt eine geeignete bestätigte Profilversion und die bestehenden rechnerspezifischen Voraussetzungen voraus. Der Ausdruck „acht von acht“ ist weder notwendig noch hinreichend für jede Analyse.
- Persönliche Empfehlungen verwenden vorhandene Analyse-/Empfehlungs-/Eignungsregeln. Freie Gesprächsrichtungen sind ausdrücklich unverbindlich und keine berechnete Empfehlung.
- „Ergebnis verfügbar“ setzt einen tatsächlich erfolgreichen, zur aktuellen Profilversion passenden Lauf voraus. Anforderung, laufender Auftrag, Fehlschlag und veraltetes Ergebnis erhalten verschiedene Anzeigen.
- Eine Kontaktaufnahme wird nur als arrangiert bezeichnet, wenn ein tatsächlich vorhandener Vorgang das belegt. Eine Telefonnummer oder ein Übergabewunsch reichen dafür nicht aus.

Anwendungsseitige Statusmeldungen und Review-Texte werden aus diesen Zuständen erzeugt. Im aktuellen direkten Echtzeit-Audiopfad können Prompts die freie Formulierung beeinflussen, aber nicht jede gesprochene Behauptung technisch garantieren. Harte Abnahmegarantien dieser Umsetzung betreffen ausgeführte Aktionen, strukturierte Ergebnisse und anwendungsseitige Anzeigen.

Vor Bildschirmprüfung/Profilbestätigung wird die freie Audiosession lokal pausiert, falls der Adapter eine nachgewiesene Pausenfunktion besitzt; andernfalls wird sie lokal beendet. Bei späterer ausdrücklicher Fortsetzung wird gegebenenfalls eine neue Voice-Session mit minimalem aktuellem Kontext geöffnet. Formulierungen zu verbindlichen Vorgängen werden in dieser Phase am Bildschirm dargestellt. Das Schliessen darf keine ungespeicherten abgeschlossenen Kundenbeiträge verlieren.

Eine spätere vollständig kontrollierte Sprachausgabe fachkritischer Texte benötigt einen dafür geeigneten Text-/TTS-Ausgabepfad. Sie ist keine vorgetäuschte Eigenschaft der aktuellen direkten Audiogenerierung.

### D11 – Beiträge, Finalität und Unterbrechung

Ein Gesprächsbeitrag besitzt stabile Segment-ID und monotone Revision sowie einen Finalitätsnachweis: Provider-Finalität, explizites Benutzerende oder als heuristisch bezeichnetes Browserende. Empfangszeit und gegebenenfalls Provider-Audiooffset werden getrennt erfasst.

Jede persistierte Segmentrevision erhält eine eigene unveränderliche Nachrichten-ID. Die stabile Segment-ID verbindet diese Revisionen. Damit bleibt der bestehende Idempotenzvertrag „gleiche Nachrichten-ID, anderer Text ist ein Konflikt“ erhalten; eine Korrektur überschreibt keinen alten VoiceLog. Nur eine neuere zulässige Revision kann den aktiven Segmentstand ersetzen.

Partielle Texte dienen zunächst Untertiteln. Sie lösen weder Übernahme noch Profilbestätigung aus. Provisorische Analyse ist optional und darf keinen verbindlichen Seiteneffekt auslösen. Die erste Umsetzung kann darauf verzichten und abgeschlossene Beiträge auswerten.

Die bestehende Ruhefensterheuristik bleibt als gekennzeichneter Fallback verwendbar; sie wird nicht als Provider-Finalität gespeichert. Benachbarte Fragmente desselben Sprechers können verbunden beziehungsweise durch eine neue Revision ersetzt werden. Ein Sprecherwechsel allein beweist keine vollständig ausgesprochene Frage.

Bei neuerer Revision werden nicht angenommene Ergebnisse der älteren Revision ersetzt oder als veraltet markiert. Bereits ausdrücklich angenommene Angaben werden nicht rückwirkend heimlich geändert; eine spätere Korrektur erzeugt einen neuen Vorschlag und macht gegebenenfalls abhängige Analysen veraltet.

Bei Unterbrechung wird lokale Audioausgabe sofort gestoppt. Mikrofon-/Playbackereignisse und Transkriptereignisse werden getrennt geführt. Ein unterbrochener Output wird nicht als vollständig präsentiert verbucht. Testbelege aus simulierten Audiotracks werden als solche ausgewiesen.

### D12 – Asynchronität, Idempotenz und Wiederanlauf

Jede Verarbeitung hält einen persistenten Beleg mit Aktion-ID, Quellsegment und Revision, Zielperson, Ausgangsrevisionen, Status und Ergebnisreferenzen. Statuswerte unterscheiden angenommen, laufend, abgeschlossen, fehlgeschlagen, abgebrochen und durch neuere Quelle überholt.

Gleiche Aktion-ID und gleicher Inhalt liefern denselben Beleg. Gleiche ID mit anderem Inhalt erzeugt Idempotenzkonflikt. Wiederholungen eines Smalltalk- oder Fehlerbeitrags lösen nicht erneut einen Modellaufruf aus; eine bewusste Wiederholung braucht eine neue Wiederholungsaktion mit Bezug auf den alten Beleg.

Extraktionen dürfen unabhängig voneinander laufen. Fachliche Commits werden über die vorhandenen Transaktionen/Versionsprüfungen geordnet. Vor Commit werden Quelle, aktuelle Revision, Session-/Sprachbezug, Berechtigung und Übergabestand erneut geprüft. Fachfremde Kontextupdates allein verwerfen keine weiterhin gültige Aussage. Konflikte an betroffenen Feldern werden explizit neu bewertet; ein blindes Neuankern auf den neuesten Entwurf ist unzulässig.

Stop, Übergabe und Zustimmungsentzug brechen laufende Aufgaben ab. Auch wenn der Provider Abbruch ignoriert, darf ein spätes Ergebnis nichts mehr vorschlagen oder ausführen. Die Prüfung unmittelbar vor Commit bleibt deshalb obligatorisch.

Nach Backend-Neustart werden nicht terminale Verarbeitungsbelege als unterbrochen angezeigt. Es gibt keine automatische Wiederholung nicht sicher rekonstruierbarer externer Aktionen. Ein ausdrücklicher Retry ist möglich; vor erneuter Ausführung wird das kanonisch vorhandene Ergebnis geprüft.

### D13 – HTTP-Vertrag und Kompatibilität

Die folgenden Verträge sind Soll-Ergänzungen; ihre Existenz wird nicht als Ist-Zustand vorausgesetzt. Authentisierung, Fallbesitz, CSRF und bestehende Rollenregeln bleiben vorgeschaltet.

Voice-Sessions erhalten einen expliziten Gesprächsmodus. Neue Voice-Lab-Sessions wählen orchestriertes Intake. Für bestehende Clients und gespeicherte Sessions ist der Standard reine Aufzeichnung. Nur der orchestrierte Modus startet Erfassung automatisch nach Ingest. Der bisherige ausdrückliche Lab-Turn-Aufruf bleibt auch für eine aufzeichnende Legacy-Session ein erlaubter Einstieg in dieselbe quellengebundene Verarbeitung. Allgemeine Voice-/Agent-Integrationen erhalten dadurch keine unerwarteten automatischen Feldvorschläge.

| Zugriff | Vertrag |
| --- | --- |
| Bestehendes Voice-Ingest | Ergänzt Quellenmetadaten für Segment-ID, Revision und Finalitätsnachweis; ein neuer abgeschlossener Kundenbeitrag startet genau eine orchestrierte Verarbeitung und liefert Verarbeitungs-ID und Status zurück |
| Bestehender Lab-Turn-Aufruf | Bleibt kompatibler Adapter; startet oder erwartet dieselbe quellengebundene Verarbeitung und liefert das bisherige Extraktionsergebnis mit ergänzten Ausgängen; kein zweiter Modellaufruf nach automatischem Ingest |
| `GET /api/cases/{caseId}/conversation-state` | Liefert schemaVersion, conversationRevision, caseRevision, contextRevision, profileVersion, Zielperson, Feldprojektionen, Klärungen, Phase, nächste Aktion, Blocker, Verarbeitungsbelege und erlaubte Gesprächsnotizen |
| `POST /api/cases/{caseId}/conversation-actions` | Unterstützt ausschliesslich erlaubte Kundenaktionen: Beitrag korrigieren, Klärung zurückstellen, Review anfordern, Präferenz setzen/zurückziehen und Verarbeitung ausdrücklich wiederholen; mit Aktion-ID und erwarteter Gesprächsrevision |
| Bestehende Bestätigungs-, Berechnungs- und Übergabezugriffe | Bleiben die ausführenden fachlichen Zugänge; der Orchestrator beobachtet ihre echten Ergebnisse und leitet keinen Erfolg aus einer blossen Anforderung ab |

Die neue Ingest-Antwort bestätigt Eingang/Persistenz, nicht den Abschluss der Extraktion. Die Verarbeitung wird per Projektion/SSE sichtbar. Der kompatible bisherige Lab-Aufruf darf auf den vorhandenen Auftrag warten und den bisherigen erfolgreichen HTTP-Status beibehalten. Laufende Aufträge werden pro Quelle zusammengeführt.

Das Conversation-State-Read ist auf die berechtigte Zielperson beziehungsweise den zulässigen globalen Geltungsbereich filterbar. Eine clientseitige Person-ID allein erteilt keine zusätzliche Berechtigung. Antworten fremder Sessions/Personenauswahl dürfen den aktuellen Browserstand nicht überschreiben.

Neue Zustandsänderungen verwenden bestehende Kontextbenachrichtigungen mit ergänzter Gesprächsrevision. Ein Read hat keine fachlichen Seiteneffekte und startet keine fehlende Extraktion nachträglich.

### D14 – Gemeinsame Projektion und gebündelte Aktualisierung

CaseStore, Review und VoiceLab lesen fachliche Daten über einen gemeinsamen Aktualisierungskoordinator. Die lokalen Intake-Versuchszähler und Unklarheiten werden aus diesem fachlichen Schreibpfad entfernt. Lokale Zustände bleiben für Ladeanzeigen, Audio und noch nicht übertragene Fragmente zulässig.

Gleichzeitige Aktualisierungsanforderungen für denselben Fall werden zusammengeführt. Während eines laufenden Loads wird höchstens ein Folgeload vorgemerkt. Ein initiales kurzes Bündelungsfenster von 100 ms darf Kontextupdates zusammenfassen. Stop-/Übergabesignale laufen synchron davor und werden nicht verzögert.

Ein gebündelter Projektionsload ruft jeden benötigten Endpunkt höchstens einmal ab. Unveränderte historische Zusatzdaten werden nicht bei jedem Transkriptfragment neu geladen. Versionsprüfungen verhindern Regression durch verspätete Antworten.

Bei Wiederverbindung wird ein frischer, konsistenter Snapshot geladen. Revisionslücken lösen Snapshot-Nachladen aus; die Anwendung setzt keine lückenlose SSE-Wiedergabe voraus. Ein zusätzlicher Broker oder eine zweite Event-Historie wird dafür nicht eingeführt.

### D15 – Providerfähigkeiten und Delegation

Provider-Adapter benennen nur nachgewiesene Fähigkeiten: Finalitätsereignisse, Unterbrechung/Pause, Delegationsprotokoll und Wiedergabenachweise. Der bestehende Adapter bleibt der erste reale Live-Adapter; Replay implementiert dieselben beobachtbaren Verträge für Tests.

Delegationsereignisse erhalten einen expliziten Ausgang: gemäss belegtem Providerprotokoll beantwortet, nicht unterstützt oder fehlgeschlagen. Es wird kein Antwortformat geraten. Nicht unterstützte Delegation löst keine fachliche Aktion aus und wird als Providerdiagnose sichtbar. Die normale Extraktion aus gespeicherten Kundenbeiträgen bleibt davon unabhängig und wird nicht doppelt gestartet.

Bis ein verifiziertes Delegationsprotokoll implementiert ist, verwendet die Anwendung keine Delegation als Voraussetzung für Gesprächsfortschritt. Behauptungen über garantierte Pausen, finalisierte Beiträge oder ausgeführte Tools benötigen Adaptertests mit entsprechenden Nachweisen.

### D16 – Beobachtbarkeit und Debug-Version 2

Fachliche Nachweise werden von hochvolumiger Diagnose getrennt. Fachlich wesentlich sind Quellen finalisierter Beiträge und deren Revisionen, Beobachtungsausgänge, Klärungen, Übergänge, Annahme-/Profilbestätigungsentscheidungen, Berechnungsreferenzen und Abbruchgründe. Wiederholte unveränderte GET-Antworten, Rohdeltas und vollständige redundante UI-Snapshots gehören zur begrenzten Diagnose.

Ein Normalbetrieb-Debug-Durchlauf verwendet ein gemeinsames logisches Budget von 32 MiB redigierter kompakter JSON-Nutzlast: 24 MiB für wesentliche Nachweise inklusive Ausgangszustand und 8 MiB für einen begrenzten Diagnosepuffer. Mehrfachversionen eines Schritts zählen nach ihrem ersetzten aktuellen Stand statt unbegrenzt doppelt. Browser und Server weisen ihren Anteil und verworfene Daten aus; Transport- und Pretty-Print-Grösse sind getrennte Messwerte.

Normale Fach- und Gesprächsverarbeitung wird nicht durch Debug-Persistenz blockiert. Bei vollem Diagnosepuffer werden ältere Diagnoseeinträge kontrolliert verdrängt; Kategorie, Zeitraum und Anzahl werden als Lücke dokumentiert. Bei ausgeschöpftem Bereich für wesentliche Nachweise wird die Aufzeichnung mit sichtbarem Kapazitätsgrund geschlossen, statt weiter scheinbare Vollständigkeit zu versprechen. Bereits gespeicherte Nachweise bleiben erhalten.

Version 2 trennt Aufzeichnungslebenszyklus, Evidenzvollständigkeit und tatsächlichen Aufgabenstatus. Ein regulär gestoppter Recorder wird nicht allein wegen eines fehlenden Abschlussnachweises als abgestürzte Unterhaltung bezeichnet. Ein serverseitig nicht beobachtetes Ende darf durch einen Browserabschluss als zusätzlicher Beleg ergänzt, aber nicht als erfundener Serverabschluss umgeschrieben werden.

Exporte enthalten Software-/Schema-/Prompt-/Extraktor-/Mappingversion, reale Providerbezeichnung, Korrelation, verwendete Revisionen und bekannte Lücken. Unversionierter Arbeitsstand bleibt als solcher kenntlich. Modellantworten werden für Replays auf die erforderlichen redigierten Toolargumente und Metadaten reduziert; nicht benötigte undurchsichtige Reasoning-Nutzlasten werden nicht archiviert.

Import von Version 1 bleibt unverändert möglich. Dessen `interrupted` bleibt ein historischer Exportstatus und wird nicht rückwirkend umgedeutet. Beim Anzeigen werden dort bekannte Evidenzlücken zusätzlich erklärt. Version-2-Felder werden nicht stillschweigend unter Version 1 exportiert.

Redaktion erfolgt vor Speicherung und Übertragung. Der bisherige Zugriffsschutz und die ausdrückliche Aufzeichnungsgrenze bleiben erhalten. Die neue kompakte Speicherung ersetzt für Version 2 bewusst das frühere unbeschränkte Wiederholen vollständiger technischer Nutzlasten.

### D17 – Messung und Fristen

Separat gemessen werden Beitragsabschluss, Extraktionsstart/-ende, fachlicher Commit, Sichtbarkeit in der UI sowie Audioeingangsende und tatsächlicher Antwort-Wiedergabebeginn, soweit der Browser diese belegen kann. Provider-Caption-Zeit ist kein Wiedergabebeginn. Heuristische Messwerte werden gekennzeichnet; monotone Laufzeitmessung und UTC-Korrelation werden getrennt verwendet.

Die vorhandene Modellaufruf-Deadline von 15 Sekunden bleibt Ausgangspunkt. Timeout liefert einen technischen Fehler mit Retry-Möglichkeit und keine Feldablehnung. Die UI zeigt laufende Verarbeitung innerhalb von 250 ms nach angenommenem Auftrag; dies ist mit kontrollierter Zeit deterministisch testbar. Live-p50/p95 werden berichtet, nicht aus Mock-Zeiten abgeleitet.

Weitere Metriken: nicht erklärbar verworfene Beobachtungen, widersprüchliche Feldprojektionen, erneute Fragen zu beantworteten Unklarheiten, GETs pro Beitrag, doppelte Modellaufrufe, verworfene verspätete Ergebnisse, Diagnoseverlust und Informationswünsche ohne Antwortinhalt.

### D18 – Migration und Integration

Bestehende Fälle werden ohne erfundene Beobachtungshistorie geladen. Fehlender Gesprächszustand startet mit einer leeren Ledger-Historie und einer Projektion der tatsächlich vorhandenen Vorschläge/Übernahmen. Herkunftslücken werden als unbekannt gekennzeichnet. Alte Transkripte werden nicht automatisch erneut an einen Provider gesendet.

Bestehende gespeicherte VoiceLogs bleiben lesbar. Bei fehlendem Finalitätsnachweis wird Legacy-Herkunft ausgewiesen, keine Provider-Finalität ergänzt. Bestehende Bestätigungen und bestätigte Profile bleiben erhalten.

Die einmalige Einführung ersetzt den bisherigen lokalen Intake-Schreibpfad. Zwei parallel aktive fachliche Gesprächsmodelle sind kein zulässiger Migrationsendzustand. Bestehende synthetische Demo-/Replayabläufe werden über dieselbe Orchestrierung geführt. Die jetzigen Zustimmungs- und Synthetic-only-Regeln werden nicht erweitert.

### D19 – Umsetzungsreihenfolge und Ausstiegskriterien

| Etappe | Inhalt | Voraussetzung für Abschluss |
| --- | --- | --- |
| E1 | Reproduzierbare Session-Regressionsfälle, neue Verträge und direkte Entscheidungs-Modultests | Tests für Risiko, 120 Prozent, „Nichts“, Schätzungen und ungültiges Alter gehen aus Verhaltensgründen rot; bestehender Build bleibt ausführbar |
| E2 | Persistenter Orchestrator, Beobachtungsausgänge, Feldhistorie, Fragen und Qualitätsregeln | AK01–AK12 sowie AK20–AK23 auf Modul-/HTTP-Ebene grün |
| E3 | Browseranbindung, gemeinsame Projektion, Review-Übergang, Ziele/Präferenzen und fachliche Gates | AK13–AK19 und AK24–AK28 grün; alter lokaler fachlicher Schreibpfad entfernt |
| E4 | Debug-Version 2, Last-/Störungsnachweise, getrennte Modell-Evaluation und Gesamtabnahme | AK29–AK35 grün, alle relevanten bisherigen Prüfungen grün, Live-Grenzen dokumentiert |

Dies sind Umsetzungsetappen innerhalb dieser Spezifikation, keine bereits angelegten Einzeltickets. Jede Etappe liefert testbaren Fortschritt. Teilfertige Etappen gelten nicht als Gesamtabnahme.

## Testing Decisions

### Bestätigte Teststrategie

Der Nutzer hat ausdrücklich stärkere direkte Modultests gewählt. Es werden deshalb drei Ebenen kombiniert:

1. **Entscheidungsmodul:** Öffentlicher Aufruf mit Zustand und Ereignis, Assert auf fachliches Ergebnis, nächste Aktion und Invarianten. Kontrollierte Uhr; keine privaten Methoden oder textuellen Quellcodeprüfungen.
2. **Orchestrierungsmodul und HTTP-Integration:** Echte Fall-, Erfassungs-, Bestätigungs-, Speicher- und Berechnungsabläufe mit temporärem verschlüsseltem Store. Externe Sprach-/Extraktions-/Rechenprovider dürfen durch kontrollierte Adapter ersetzt werden. Zentrale Modul- und wenige durchgängige HTTP-Fälle verhindern, dass eine falsche Verdrahtung hinter korrekten Einzelfunktionen verborgen bleibt.
3. **Gerenderter Browser:** Bedienung über DOM und öffentliches Verhalten; echte Projektion und Orchestrierungsanbindung. Audio-/Providerereignisse werden für deterministische Störungsprüfungen kontrolliert. Wenige echte Browserverbindungen ergänzen diese Tests für Mikrofon, Wiedergabe und Unterbrechung; simulierte Tracks belegen keine hörbare Qualität.

Die Tests prüfen Resultate und erlaubte/unterbundene Aktionen, nicht exakte interne Aufrufreihenfolge ohne fachliche Bedeutung. Netzwerkzählung ist dort eine Verhaltensanforderung, wo das explizite Reload-Budget geprüft wird. Es werden keine Tests geschrieben, die lediglich Implementierungsnamen oder dieselbe Fallunterscheidung spiegeln.

Vorbilder sind die vorhandenen Voice-Lab-Konversations-, Voice-Integrations-, Customer-Confirmation-, Debug-/Session-Kontext- und gerenderten Voice-Lab-/CaseStore-Tests. Veränderte fachliche Erwartungen werden bewusst angepasst; bestehende Authentisierungs-, Übernahme-, Supersession- und Abbruchregeln werden nicht zugunsten neuer grüner Tests abgeschwächt.

### Abnahmefälle

| ID | Szenario | Erwartetes beobachtbares Ergebnis | Primärer Testzugang |
| --- | --- | --- | --- |
| AK01 | „Möglichst viel Flexibilität“ | Zielnotiz erfasst; keine Einstufung high; passende Risikorückfrage, falls nötig | Entscheidungsmodul + HTTP |
| AK02 | „Ich akzeptiere gewisse Schwankungen“ | Kontext bleibt erhalten; ohne explizite Einstufung keine automatische high-Klassifikation | Entscheidungsmodul |
| AK03 | „120 Prozent“ zum Pensum | Bereich/Bedeutung erkannt; konkrete Klärung; keine leere scheinbar erfolgreiche Extraktion | Orchestrator + HTTP |
| AK04 | Grobe monatliche Wohnkosten 1'500 | CHF 1'500/Monat als Schätzung vorgeschlagen; Qualität im Review sichtbar | Orchestrator + Browser |
| AK05 | Pensionierung 60, dann „Nichts“ zur Zusammenfassung | Wert und Qualität bleiben erhalten; keine neue Unklarheit, keine automatische Übernahme | Entscheidungsmodul + HTTP |
| AK06 | Pensionierungsalter 5 | Vor Vorschlagserstellung feldspezifisch geklärt; kein ungültiger Änderungspaket-Commit | Orchestrator |
| AK07 | Jahresbrutto CHF 400'000 | Intern korrekt 40'000'000 Rappen; Modellkontext nennt eindeutig CHF 400'000 und Periode/Basis | Orchestrator |
| AK08 | „Maximal in die dritte Säule“ | Bestehendes Sparen als Kontext; Jahresbetrag erfragen; kein erfundener Höchstbetrag | Entscheidungsmodul |
| AK09 | Kurze Antwort bei mehreren/unterbrochenen Fragen | Unsicherer Bezug bleibt explizit; keine Übernahme oder geratenes Mehrfeld-Update | Entscheidungsmodul + Browser |
| AK10 | Kumulatives Paket über mehrere Beiträge | Jede Änderung behält ihre ursprünglichen Kundenquellen und Ersetzungsbezüge | HTTP |
| AK11 | Beantwortete Unklarheit | Passende Antwort erscheint als anstehende Übernahmeentscheidung; Frage wird nicht unverändert wiederholt | Orchestrator + Browser |
| AK12 | Smalltalk, Auslassen und technischer Fehler | Kein ungerechtfertigter Versuchszähler; Ablehnung respektiert; technische Störung separat sichtbar | Entscheidungsmodul |
| AK13 | Annahme eines Änderungspakets | Nur expliziter bestehender Bildschirmablauf ändert den Entwurf; Gesamtprofil bleibt unbestätigt | HTTP + Browser |
| AK14 | Profilbestätigung mit Annahmen | Separater Bildschirmablauf; Schätzungen sichtbar; Berechnungsgrundlage referenziert Qualität/Herkunft | HTTP + Browser |
| AK15 | Berechnung ohne geeignete Bestätigung | Aktion abgelehnt mit konkreten Blockern; kein Provideraufruf, kein angebliches Ergebnis | HTTP |
| AK16 | Lauf läuft/fehlschlägt/ist veraltet | Drei unterscheidbare Zustände; Ergebnis nur bei erfolgreichem passendem Lauf als verfügbar | Orchestrator + Browser |
| AK17 | Wunsch nach Produktinformationen | Reine „Klar, gerne“-Antwort erledigt den Wunsch nicht; belegte Information oder konkrete Wissenslücke statt erfundener Konditionen | Entscheidungsmodul + Modell-Evaluation |
| AK18 | Eindeutiger Favorit und „Ja gerne“ | Nur die eindeutig bestätigte Richtung wird als Präferenz gespeichert; keine Empfehlung/Offerte erzeugt | Orchestrator + Browser |
| AK19 | „Ab 50 reduzieren, mit 60 aufhören“ | Beide unterschiedlichen Ziele bleiben mit Quelle erhalten | Orchestrator |
| AK20 | Gleicher Beitrag doppelt, auch bei leerem Ergebnis | Ein Verarbeitungsbeleg und höchstens ein Modellaufruf; Inhaltswechsel bei gleicher ID wird abgelehnt; echte Revision hat neue Nachrichten-ID | Orchestrator + HTTP |
| AK21 | Ältere Extraktion kommt nach Korrektur zurück | Kein Überschreiben des neueren Ergebnisses; alte Quelle als überholt nachvollziehbar | Orchestrator |
| AK22 | Feld wurde während der Extraktion geändert | Gültigkeit wird feldbezogen geprüft; kein blindes Neuankern oder Überschreiben | Orchestrator + HTTP |
| AK23 | Übergabe/Entzug/Stop während Providerarbeit | Sofortiger lokaler Stop; auch ignoriertes AbortSignal erlaubt keinen späten Commit | Orchestrator + Browser |
| AK24 | Wiederverbindung und Browserneuladen | Gemeinsamer persistenter Stand wird geladen; keine verlorenen Klärungen oder fremden Personenwerte | HTTP + Browser |
| AK25 | Unterbrechung einer gesprochenen Frage | Unterbrochener Output nicht vollständig präsentiert; keine Sprachbestätigung; lokale Ausgabe stoppt | Browser |
| AK26 | Bildschirmprüfung ohne nachgewiesene Providerpause | Direkte lokale Audiosession wird beendet; Fortsetzung ausdrücklich und mit aktuellem Kontext | Browser |
| AK27 | Zehn Kontextupdates während eines Loads | Nach initialem Load höchstens ein vorgemerkter Folgeload; jeder benötigte Endpunkt höchstens einmal je Load | Koordinatormodul + Browser |
| AK28 | Prozessneustart mit laufender Verarbeitung | Unterbrochener Verarbeitungsbeleg statt vorgetäuschtem Erfolg; kein automatischer externer Wiederaufruf | Orchestrator + HTTP |
| AK29 | Virtuelle 20-Minuten-Session mit 200 Segmenten, 100 Extraktionen und 2'000 redundanten Reads | Wesentliche Quellen, Ausgänge und Entscheidungen bis zum Schluss vorhanden; wiederholte Read-Daten verdrängen sie nicht | Debug-Modul + HTTP/Export |
| AK30 | Diagnosepuffer voll | Definierte Verdrängung und Lückennachweis; keine Beeinflussung fachlicher Ergebnisse | Debug-Modul |
| AK31 | Wesentlicher Speicherbereich voll oder Debug-Persistenz defekt | Sichtbarer Aufzeichnungsabschluss/-fehler; bestehende Belege lesbar; Gespräch läuft unabhängig weiter | Debug-Modul + Browser |
| AK32 | Serverabschluss fehlt, Browserabschluss vorhanden | Zwei korrekt attribuierte Nachweise; kein erfundener Serverabschluss und kein behaupteter Gesprächsabsturz | Debug-Modul + Export |
| AK33 | Alter Version-1-Export und neuer Version-2-Export | Beide importierbar; Version und Evidenzlücken korrekt; keine stillschweigende Schemaumdeutung | Export-/Import-Modul |
| AK34 | Unbekannte/unsupported Delegation | Expliziter Diagnoseausgang; kein geratenes Providerreply, kein doppelter fachlicher Auftrag | Provider-Adapter |
| AK35 | Bestehender Fall, Legacy-Aufzeichnung, fehlende Erlaubnis, fremder Fall und Read-only-Analyse | Migration ohne erfundene Historie; Legacy-Ingest ohne automatische Erfassung; Zugriff verweigert wo nötig; Reads verursachen keine Modell-/Rechen-/Übernahmeaktion | HTTP |

### Replays und echte Modellqualität

Die untersuchte Session wird nicht als 81-MB-Datei ins Repository kopiert. Kleine synthetische Fixtures erhalten die relevanten Sprecherfolgen, gebundenen Fragen, normalisierten Toolantworten und erwarteten Ausgänge. Quell-ID und bekannte Aufzeichnungslücken werden in Fixture-Metadaten dokumentiert. Ein Replay prüft den Umgang mit der aufgezeichneten Antwort, nicht die Wahrscheinlichkeit, dass das heutige Live-Modell dieselbe Antwort generiert.

Die getrennte Modell-Evaluation enthält mindestens die Befunde Risiko/Flexibilität, Pensum, „Nichts“, geschätzte Wohnkosten, mehrdeutige Kurzantworten und Informationswünsche. Jeder deterministische fachliche Fall läuft unabhängig vom externen Modell. Live-Evaluation verwendet nur synthetische Inhalte und berichtet Prompt-/Modellversion, Stichprobenumfang und einzelne Fehlfälle. Ein nicht ausgeführter Live-Test wird nicht als bestanden geführt.

Mindestens Deutsch ist mit den Session-Regressionsfällen vollständig abzudecken. Für Englisch, Französisch und Italienisch gibt es je einen vollständigen synthetischen Ablauf inklusive Schätzung, Klärung, Übernahme und Profilbestätigung. Alle neuen UI-Texte sind in den vier vorhandenen Sprachen vorhanden.

### Prüfungen und Definition of Done

- Abnahmefälle AK01–AK35 sind mit nachvollziehbarer Zuordnung zu ausgeführten Tests belegt.
- Direkte Modultests prüfen den echten Orchestrator und seine Entscheidungslogik, nicht eine im Test nachgebaute Implementierung.
- Backend-Build, Client-Vertragstypprüfung und Exportprüfung der Verträge bestehen; als Gesamtprüfung läuft `npm test` im Code-Workspace.
- Tests und Produktionsbuild der Debugging-App bestehen; ebenso relevante Web-App-Tests sowie `check:i18n` und `check:tokens`.
- Eine dokumentierte synthetische Browser-Session erreicht entweder einen echten passenden Berechnungslauf oder endet nachvollziehbar mit den konkreten Blockern. Keine behauptete Berechnung ohne Lauf.
- Übernahme, Profilbestätigung, Abbruch, bestehende Berechtigungen und Supersession sind durch Regressionen abgesichert.
- Debug-Version 2 bleibt bis zum Ende eines normalen Lastfalls auswertbar. Verdrängte optionale Diagnose ist sichtbar; fehlende Belege gelten nicht als Erfolg.
- Live-Audiolatenz und Formulierungsqualität werden separat berichtet. Freie Provider-Audioausgabe erhält keine durch reine Mocktests unbelegte Garantie.
- Es existiert nur ein aktiver fachlicher Gesprächsschreibpfad. Überholte lokale Entscheidungslogik und widersprüchliche Promptanweisungen sind entfernt.
- Verifikation dokumentiert tatsächlich ausgeführte Befehle, Ergebnisse, verbleibende Einschränkungen und Versionsstände. Diese Spezifikation allein ist kein Implementierungsnachweis.

## Out of Scope

- Microservices, Kafka, zusätzliche Datenbank oder vollständiges Event Sourcing.
- Echte Personen-/Gesundheitsdaten oder eine Erweiterung der vorhandenen Synthetic-only-Freigabe.
- Automatische Übernahme aus freier Sprache oder neue Sprachbestätigungen ohne den bestehenden gebundenen Bildschirmablauf.
- Vollständig kontrollierte Text-/TTS-Ausgabe aller Antworten; sie bleibt eine spätere Integrationsentscheidung.
- Garantie, dass ein direkt Audio generierendes Modell niemals eine unerwünschte Formulierung äussert.
- Neue Produktkonditionen, regulatorische Eignungsbewertung, Steuerlogik oder neue Berechnungsmodelle.
- Automatische Terminvereinbarung, Rückrufbeauftragung oder Vertragsabschluss allein aus einer Gesprächspräferenz.
- Dauerhafte Cloud-Archive, rohe Audioaufzeichnung oder eine externe automatische Debug-Analyse.
- Ein nicht belegtes Delegationsprotokoll; unsupported Ereignisse erhalten einen expliziten Ausgang.
- Einzeltickets, Umsetzungscode, Commits, Pushes oder externe Issues im Rahmen dieses Dokumentationsauftrags.

## Further Notes

### Abgrenzung zu bisherigen Entscheidungen

Diese Spezifikation ersetzt für die neue Implementierung die bisherige clientseitige fachliche Intake-Erinnerung und den pauschalen Zusammenhang „nur exact kann vorgeschlagen werden“. Die frühere Entscheidung, Lab-Unklarheiten ausschliesslich als flüchtige Turn-Daten zu führen, wird durch persistenten Gesprächszustand ersetzt. Das bestehende CaseAmbiguity-Modell wird nicht zweckentfremdet; die fachlichen Verknüpfungen bleiben ausdrücklich.

Bestehende Übernahme-/Profilbestätigungsregeln, Fallbesitz und Synthetic-only-Grenzen gelten weiter. Für Debug-Version 1 bleibt das alte Importverhalten erhalten; die begrenzte, differenzierte Diagnose ist ein neuer Version-2-Vertrag.

Die aktuellen Domain-Dokumente unterscheiden Unterhaltungslog, Feldvorschlag, bestätigte Angabe, Unklarheit, beantwortete Unklarheit, Bestätigungsanforderung und Feldhistorie. Diese Begriffe gelten hier entsprechend. Die Projektprüfung hat keine vorhandenen ADR-Dateien gefunden; es wird daher keine nicht vorhandene Architekturentscheidung als Grundlage behauptet.

### Leitlinie für die Implementierung

Das Modell interpretiert und formuliert. Das Gesprächs-Orchestrierungsmodul verantwortet Bedeutung, Fragebezug und Fortschritt. Der verbindliche Fallstand verantwortet übernommene Angaben und tatsächlich ausgeführte fachliche Aktionen. Der Browser stellt diese Entscheidungen dar und steuert Audio, ohne eine zweite fachliche Wahrheit aufzubauen.

## Comments

- 2026-11-01: Spezifikation aus Sessionanalyse und Architekturgespräch erstellt. Nutzerpräferenz für stärkere direkte Modultests übernommen. Es wurde noch keine Implementierung begonnen.
