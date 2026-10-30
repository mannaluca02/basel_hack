# Öffentliche Pax-Vorsorgeanalyse – Sichtung, Archiv und Test

Stand: 30.10.2026. Öffentlicher Einstieg: https://www.pax.ch/de/private-vorsorge/vorsorgeanalyse/embedded.
Sichtbare Version: `vlot-261023-154824-e7a954-86861-26.10-4`.

Die öffentliche Analyse funktioniert im getesteten Familienpfad bis zum PDF-Export. Sie ist bereits eine umfangreiche digitale Vorsorgeanalyse mit Familienkontext, Säulenleistungen, Steuerbetrachtung und priorisierten Lücken. Die Challenge-Aussage einer ausschließlich menschlichen Beratung beschreibt diese aktuelle öffentliche Funktion nicht vollständig. Ein neuer Advisor muss seinen zusätzlichen Nutzen gegenüber dieser bestehenden Lösung zeigen.

## Durchlauf und Testdaten

Einwilligung am Start nach ausdrücklicher Nutzerbestätigung; optionale Pax-Cookies abgelehnt. Ausschließlich erfundene Angaben, keine echten Kontakt- oder Gesundheitsdaten, keine Kontaktanfrage und keine Aktivierung eines Versicherungsprodukts.

| Merkmal | Eingabe |
|---|---|
| Haushalt | TEST Nina und TEST Tom; verheiratet seit 2018; 4051 Basel |
| Erwachsene | Juni 1991 / April 1989; beide nicht rauchend |
| Kinder | TEST Mila, Mai 2019; TEST Leo, September 2023; beide Eltern unterstützungspflichtig |
| Einkommen | CHF 100’000 / CHF 60’000 brutto pro Jahr; Informatikerin / Kaufmann |
| Pensionskasse Nina | Erfundenes Leistungsblatt mit sieben manuellen Werten |
| Pensionskasse Tom | Kein Ausweis; ausdrücklich BVG-Minimalleistungen als Schätzung gewählt |
| Dritte Säule | TEST 3a Sparkonto: CHF 20’000 Bestand, CHF 5’000 jährliche Einzahlung |
| Weitere Deckungen | Keine bestehenden Lebensversicherungen angegeben |
| Wohnen | Miete inklusive Nebenkosten CHF 2’400 monatlich |

Alle Einzelwerte und Einheiten stehen im [reproduzierbaren Eingabedatensatz](../references/public-pension-analysis/inputs/fictitious-family.json). Die Beträge sind Testwerte und keine Kundendaten.

Der Ablauf: Lebenssituation → persönliche Angaben → Partner → Zivilstand → Kinder → Erwerb beider Personen → Pensionskassen → Sparen/Vermögen → bestehende Policen → Wohnsituation → Übersicht/Familienvorsorge/Pensionierung/Steuern/Lösung → Abschlussdialog → Pax-Ergebnisseite → PDF-Download. Das Abschließen friert die Analyse laut Dialog ein; es wurde kein Versicherungsvertrag abgeschlossen.

## Was getestet wurde

| Prüfung | Beobachtung |
|---|---|
| Pflichtangaben | Weiter zunächst deaktiviert; nach erforderlichen Eingaben freigegeben |
| Zukunftsgeburtsjahr 2035 | Mindestalter-Hinweis; Fortsetzung nach Korrektur auf 1991 |
| Partner und zwei Kinder | Bedingte Felder einschließlich Heiratsjahr und Unterstützungspflicht durchlaufen |
| Pensionskasse | Manuelle Werte sowie Schätzpfad getestet; Genauigkeitswarnung beim fehlenden Ausweis |
| 3a: CHF 99’999 jährlich | Abgelehnt; UI zeigt Grenze CHF 7’258; mit CHF 5’000 fortgesetzt |
| Vollständiger Familienpfad | Ergebnis berechnet; alle fünf Ergebnistabs und ein Invaliditätsdetail geöffnet |
| PDF-Export | Ohne E-Mail oder Leadformular heruntergeladen; 17 Seiten, als Entwurf markiert |

Es handelt sich um einen dokumentierten manuellen Funktionstest, keine Lastprüfung oder fachliche Zertifizierung der Rechenmodelle. Einheiten, Pflichtfelder und Verhalten sind geprüft; die Renten- und Steuerwerte wurden nicht unabhängig nachgerechnet. DE wurde getestet; EN/FR/IT waren im Sprachmenü sichtbar. Andere Lebenssituationen, Wohneigentum, QR-Import und frühere Pensionierung wurden nicht getestet.

## Angezeigte Ergebnisse dieses Testfalls

| Anzeige | Wert |
|---|---:|
| Übersichtsscore | 773 / 1000 |
| Monatliche Pensionslücke Nina | CHF 2’689 |
| Monatliche Invaliditätslücke Nina / Tom | CHF 210 / CHF 40 |
| Monatliche Todesfalllücke Nina / Tom | jeweils CHF 0 |
| Potenzielle Steuerersparnis der Familie | CHF 2’422 pro Jahr |
| Sparziel / monatlicher Sparbetrag | CHF 606’385 / CHF 1’353 |

Die Rentenansicht nennt AHV und Pensionskasse getrennt und zeigt Kapitalverzehr. Die PDF-Zeitachse berücksichtigt die zeitversetzte Pensionierung beider Personen. AHV-Fehljahre und Ehepaar-Plafonierung sind in der UI erläutert. Das ist eine existierende Referenzfunktion, kein neu zu beanspruchendes Alleinstellungsmerkmal.

## Klärungspunkte für Pax

1. **Risikolücke und Lösung widersprechen sich sichtbar:** Die Übersicht und Detailansicht zeigen CHF 210 beziehungsweise CHF 40 monatliche Invaliditätslücke. Die Lösung zeigt dennoch keine Lücke beziehungsweise CHF 0 jährliche Absicherung. Das PDF wiederholt diese Kombination auf Seiten 3/4/11/12. Ob Rundung, Mindestdeckung, Annahmen, ein Darstellungsfehler oder eine andere Regel zugrunde liegt, wurde nicht festgestellt.
2. **Exportstatus:** Der Download nach erfolgreichem Abschluss trägt ab Seite 2 den Status „Entwurf / Unvollständige Eingaben“. Im durchlaufenen Pfad waren alle zum Weitergehen erforderlichen Eingaben ausgefüllt; für Tom wurde bewusst eine PK-Schätzung verwendet. Ob diese Schätzung den Status verursacht, ist nicht belegt. Der Bericht darf nicht als fachlich freigegebene Beratung behandelt werden.
3. **LifeStar-Verweis:** Die Pax-Ergebnisseite verlinkt weiterhin den gemischt geschriebenen Pfad `pax-lifeStar`. Dafür existiert ein früherer 404-Nachweis; in diesem Test wurde der Link nur beobachtet und nicht erneut geöffnet. Die kleingeschriebene aktuelle Produktseite ist bereits separat archiviert.

Diese Beobachtungen sind Fragen für den Pax-Domain-Experten und keine nachgewiesenen Fehler der Versicherungsmathematik.

## Konsequenzen für LifeMap und das Fünferteam

Der Mehrwert liegt in einem verständlichen, gemeinsam bearbeitbaren Lebensplan mit erklärten Änderungen und durchgängiger Fallübergabe. Formulare, Lückenrangfolge, mehrere Säulen, Steuerhinweise und PDF allein unterscheiden den PoC noch nicht ausreichend.

- Person 1: Einen Vorher-/Nachher-Vergleich für Familienplanung, Pensumsänderung, Eigenheim und Pensionierungszeitpunkt auf demselben Fall zeigen; Schätzwerte unmittelbar erkennbar machen.
- Person 2: Rechenannahmen und Jahre versionieren; Logismata als separat freigegebenes Backend behandeln. Aus der öffentlichen vlot-Oberfläche folgt weder API-Zugriff noch fachliche Identität mit Logismata.
- Person 3: Jede Empfehlung auf genau dieselbe Lücke wie die Ergebnisansicht zurückführen. Schwellenwerte, Ausnahmen und die Alternative ohne neues Produkt erklären.
- Person 4: Beratungsstand, Offerte, Antrag und Demo-Police ohne erneute Profilerfassung verbinden; Entwurf, Prüfung und endgültige Ausstellung getrennt darstellen.
- Person 5: Diese beiden Darstellungs-/Statusfragen mit Cem/Claude klären und als konkrete Abnahmekriterien übernehmen. Den Referenzfall als synthetisch und den Export als Entwurf kennzeichnen.

Produktlinks und ein Pax-Care-Checkout-Link waren auf der Ergebnisseite sichtbar. Checkout, Signatur, Risikoprüfung, Vertragsannahme und Policenübertragung wurden nicht ausgeführt oder als verbunden nachgewiesen.

## Gesicherte Dateien und Grenzen des Downloads

- [Unveränderte Originalauswertung mit Testdaten](../references/public-pension-analysis/reports/analysis-fictitious-family.pdf), 17 Seiten. Enthält eine technisch erzeugte Referenz auf ausschließlich diesen synthetischen Fall.
- [Nutzungsbedingungen](../references/public-pension-analysis/legal/terms-de.pdf), 3 Seiten; [Datenschutzhinweise](../references/public-pension-analysis/legal/privacy-de.pdf), 6 Seiten. Öffentlich beim Test verlinkte Fassungen vom Oktober 2023; dies ist keine Aussage über deren juristische Aktualität.
- [Maschinenlesbares Test-/Herkunftsprotokoll](../catalog/public-pension-analysis.json), mit Beobachtungen, Einschränkungen und SHA-256-Prüfsummen.
- [Textstände der UI-Schritte](../references/public-pension-analysis/snapshots/) und [Screenshots](../evidence/screenshots/public-pension-analysis/); Session-IDs in Textständen redigiert, Menü-Screenshot mit Analyse-ID nicht übernommen.
- [Gerenderte PDF-Seiten](../generated/previews/public-pension-analysis/report/); Text für alle 17 Seiten extrahiert, Seiten 1/4/6/11 visuell geprüft. Die AGB-/Datenschutz-PDFs wurden technisch geöffnet und textlich gesichtet; jeweils Seite 2 zusätzlich gerendert.

Der geladene Frontend-Stand liegt ausschließlich lokal unter `documentation/baselhack/private/public-pension-analysis/site/`: zwei HTML-Stände, 42 direkt beobachtete öffentliche Skript-/Style-/Schrift-/Bilddateien sowie sechs weitere mit der Browser-Archivierung gesicherte Assets. Herkunft und Prüfsummen stehen im Testkatalog. Tracking-Skripte wurden nicht zusätzlich geladen. Das ist kein Backend- oder Quellcode-Export und keine lauffähige Offline-Kopie. Fremdsoftware wird nicht in den PoC eingebaut oder mit Git veröffentlicht. Der bestehende Logismata-Token wurde für diesen Test nicht verwendet oder verändert.
