# Pax Digital Advisor: Fachgrundlagen

Stand: 31.10.2026, gekürzt am 01.11.2026. Was wir aus den Unterlagen der Challenge und von Pax über Vorsorge, Produkte und Empfehlungen gelernt haben. Die Planung aus der Workshop-Phase (Bauplan, Architekturentwurf, Demogeschichte, Quellenkatalog) ist in der Git-Historie; wie das System heute gebaut ist, steht in der [Architektur](../../architecture.md).

## 1. Entscheidung und Nutzenversprechen

**„Verstehe heute, was deine Entscheidungen für morgen bedeuten.“**

Die Workshop-UI übersetzt diese drei Produktbausteine in die fünf Ansichten Progress / Graphics / Chat / Info / Summary. Die Oberfläche verbindet weiterhin drei fachliche Elemente:

- **LifeMap:** Haushalt, Ziele, Budget und bestehende Versorgung aus allen drei Säulen.
- **Future Lab:** Vergleich von Familie/Arbeitspensum, Wohneigentum und Pensionierung mit nachvollziehbaren Annahmen.
- **Beratungsdossier:** bestätigte Angaben, Quellen, Berechnungen, Alternativen und Gründe für jeden vorgeschlagenen Schritt. Das Dossier begleitet Offerte, Antrag und spätere Police.

Der AI Advisor fragt gezielt nach entscheidungsrelevanten Unbekannten und erklärt Ergebnisse. Finanzielle Berechnungen und Produktregeln kommen aus kontrollierten, versionierten Komponenten. Der Advisor darf auch zum Ergebnis kommen, dass aktuell keine zusätzliche Versicherung nötig ist oder zuerst Informationen fehlen.

## 2. Was tatsächlich verfügbar ist

| Ressource | Verifizierter Stand | Konsequenz für den Prototyp |
|---|---|---|
| Challenge-Material | Alle 10 angebotenen PDFs, zusammen 268 Seiten, aus dem Original-ZIP extrahiert | Personas, Vorsorgeanalysen, Angemessenheitsprüfung und fünf vollständige Muster-Offerten als Arbeitsgrundlage |
| Ergänzende PDFs | 6 technische Tarifunterlagen und 19 weitere Produkt-/Fondsunterlagen, zusammen 123 Seiten | Regeln und Produktunterschiede strukturiert erfassen; Versionsdatum mitführen |
| Logismata | OpenAPI 3.1.0, APICalc-Version 1.2, 24 Operationen | Serveradapter statt eigener unkontrollierter Versicherungsrechnung |
| Rechnerbeispiele | Zu allen 24 Hub-Rechnern sind Beispiel-Anfrage, sichtbare HTTP-200-Antwort und JSON-Datei gesichert | Integrationsbeispiele und Ausgangspunkt für spätere Adaptertests; keine vollständige fachliche Validierung |
| Steuerbasis | Beispielantwort: Version 26.09, Datum 10.09.2026 | Datenstand an jeder Steuerberechnung sichtbar machen |
| Quicksale | Produktübersicht und Angebotsrechner in der EDU-Umgebung geprüft; fiktive Person verwendet | Übergabefelder und Tarifoptionen sind greifbar; eine integrierbare Sales-API ist damit noch nicht nachgewiesen |
| Digitalantrag | Öffentliche Pax-Seite beschreibt Antrag, digitale Unterschrift und Wiederaufnahme für Vertriebspartner | Als vorhandenen Partnerprozess berücksichtigen; Kundenselbstbedienung und technische Anbindung mit Pax klären |
| Kundenportal | Öffentliche Portalübersicht nennt die Verwaltung privater Lebensversicherungen | Zielbild für den Policenschritt; tatsächliche Ausstellung und Portalübergabe nicht verifiziert |
| Design | Storybook, Installation, Design-Tokens, Typografie, öffentliche Markenregeln und entpackte Original-Logodateien gesichert | Pax-Auftritt übernehmen; Paketberechtigung und Schriftlizenz vor Umsetzung prüfen |

**Ablage im Team-Repo:** `documentation/baselhack`. Fachquellen stehen unter `references/` sowie im gemeinsamen Ordner `documentation/challenge_material/`. PDF-Texte und Vorschauen stehen unter `generated/`; Logos und Videos unter `assets/pax/` im Repo. Das Quellenverzeichnis am Dokumentende führt jedes PDF und die ergänzenden Seiten auf. Die Originaldateien bleiben unverändert.

**Ablagestruktur:** Redundante PDF-Kopien wurden zusammengeführt; alle Herkunftslinks bleiben im Katalog. Logo-ZIPs sind vollständig in `assets/pax/logos/` entpackt. Es wird standardmäßig kein ZIP erzeugt.

**Zugang:** Der Bearer-Token ist mit ausdrücklicher Nutzerfreigabe ausschließlich in der gitignorierten Root-`.env` mit Dateirechten `0600` abgelegt und nicht Teil des auslieferbaren Materialpakets. Das ausgelesene JWT-Ablaufdatum ist **03.11.2026, 23:59:59 Europe/Zurich**; die JWT-Signatur wurde bei dieser Metadatenprüfung nicht verifiziert. Für spätere Nutzung Zugang im Hub prüfen. Kein Token gehört ins Frontend oder in dieses Dokument.

## 3. Anforderungen an das Ergebnis

| Challenge-Anforderung | Geplante Umsetzung | Nachweis in der Demo |
|---|---|---|
| Lebenssituation und Entwicklungsziele | Bestätigbares Haushaltsprofil, Ziele, Budget und offene Angaben | Zielwahl und persönliche Prioritäten vor der ersten Produktempfehlung |
| Alle drei Säulen | AHV/IV, berufliche Vorsorge sowie 3a/3b und bestehende private Absicherung mit Quellenstatus | Sichtbare Aufteilung der Leistungen und des verfügbaren Kapitals |
| Familie, Eigenheim, Pensionierung | Drei echte Szenariomodule auf demselben Profil | Eine Änderung führt zu neu berechneten, gespeicherten Ergebnissen |
| Situationsgerechte Pax-Lösung | Zunächst Bedarf und Handlungsoptionen; danach regelbasierter Produktvergleich | Begründung, Alternative, Einschränkung und verbleibende Lücke |
| Advisory bis Police | Durchgängiger gespeicherter Fall mit klaren Statusübergängen | Nachvollziehbarer Weg bis zur ausdrücklich simulierten oder tatsächlich angebundenen Police |
| Intelligente Rückfragen | Fragen nach Auswirkung auf die Entscheidung und Datenlücken priorisieren | Advisor fragt nach fehlenden PK-/Arbeitgeberleistungen statt voreilig mehr Versicherung vorzuschlagen |
| Menschliche Beratung | Definierte fachliche Auslöser und vollständige Übergabe | Ein Grenzfall wird mit Erklärung an eine Person übergeben |
| Erklärbarkeit und Datenschutz | Dokumentierte Kriterien, kontrollierte Datenwege, Zugriffsschutz und prüfbare Berechnungen | Herkunft und Annahmen lassen sich öffnen; kein ungeprüfter Modellversand |

Die Workshop-Fassung setzt fünf Workspace-Ansichten, Zeitbudget-Opener, grundlegenden Agent/Progress, Voice-Anbindung, Grafik-Erklärungen und Summary-Sichten als aktuellen Umsetzungszuschnitt. Der Video-Avatar bleibt ausdrücklich Nice-to-have; Mehrsprachigkeit, zusätzliche Follow-up-Übersicht, NPS und weitere Abbruchanalysen sind Erweiterungen.

## 4. Erkenntnisse aus den Unterlagen, die den Plan verändern

### 4.1 Versorgungslücken ändern sich über die Zeit

Der gelieferte Paar-Vorsorgecheck zeigt im konkreten Krankheitsfall zunächst einen jährlichen Überschuss von CHF 2’321 und ab dem im Beispiel hinterlegten Ende der Kinderleistungen eine Lücke von CHF 14’029. Beim Tod durch Krankheit wächst die jährliche Lücke im selben Referenzfall von CHF 4’106 auf CHF 20’660. Bei gestaffelter Pensionierung wechselt der Haushalt von einem Überschuss von CHF 8’605 zu einer Lücke von CHF 33’827, sobald beide pensioniert sind.

**Designentscheidung:** Die zentrale Grafik ist eine Zeitachse mit Ereignissen und Leistungsphasen. Ein heutiger grüner Status darf eine spätere Unterdeckung nicht verstecken. Diese Zahlen sind Werte des bereitgestellten Musterfalls, keine allgemeinen Leistungszusagen. Insbesondere darf aus dem dort gesetzten Enddatum keine allgemeine Regel „Kinderrenten enden immer mit 18“ abgeleitet werden.

**Quelle:** Paar-Vorsorgecheck, PDF-Seiten 4, 7 und 16; diese Seiten wurden zusätzlich gerendert und visuell geprüft.

### 4.2 Krankheit und Unfall getrennt behandeln

Der Einzelpersonen-Vorsorgecheck weist bei Erwerbsunfähigkeit durch Krankheit im dritten Jahr CHF 7’200 Jahreslücke aus, durch Unfall im dargestellten Vergleich keine Lücke. Seine dargestellte Alterslücke beträgt CHF 23’641 jährlich.

**Designentscheidung:** Krankheit und Unfall werden als unterschiedliche Fälle modelliert. Arbeitgeberleistungen, Taggeld, UVG und PK-Leistungen werden koordiniert und nicht ungeprüft addiert. Die Beispielanalysen sind Referenzfälle; sie ersetzen keine aktuelle Berechnung mit vollständig identischen Eingaben und Annahmen.

**Quelle:** Einzelpersonen-Vorsorgecheck, PDF-Seiten 3–5 und 9–11.

### 4.3 Fehlender Bedarf ist keine bewiesene Bedarfsfreiheit

Beim bereits durchgeführten synthetischen Risiko-Test führte ein nicht gesetzter Bedarf zu einer ausgegebenen Null-Lücke. Mit einem Bedarf von CHF 90’000 ergab Szenario 1 CHF 69’268 Einkommen und CHF 20’732 Lücke. Der separat archivierte Standarddatensatz enthält die unveränderten Hub-Beispiele und ist vom zuvor geänderten Testfall zu unterscheiden.

**Designentscheidung:** Unbekannte Angaben bleiben `unknown`; keine Umwandlung in Null ohne fachlich begründete Regel. Ohne bestätigten Bedarf gibt es keine Aussage „ausreichend versichert“. Jahres- und Monatsbeträge sind explizit gekennzeichnet.

### 4.4 Haushaltsplanung und persönliche Angemessenheit sind verschieden

Die Angemessenheitsprüfung für qualifizierte Lebensversicherungen betrachtet bei der persönlichen Einkommens- und Vermögenserfassung ausdrücklich eigene Werte ohne Hinzurechnung des Partners. Sie prüft finanzielle Tragbarkeit, Anlageziel, Horizont, Kenntnisse, Erfahrung und Risikobereitschaft. Unvollständige Angaben erlauben keine abgeschlossene Prüfung. Das Formular erklärt außerdem, dass es nur unverändert verwendet werden darf.

**Designentscheidung:** Haushaltsübersicht und persönliches Anlageprofil sind getrennte Datensichten. Ein gemeinsames Vermögen legitimiert nicht automatisch eine individuelle Sparverpflichtung. Der digitale Vorabdialog im Prototyp ist als Vorprüfung gekennzeichnet und ersetzt das unveränderte offizielle Formular oder einen von Pax freigegebenen digitalen Prozess nicht. Die im Formular gezeigte Punkte- und Garantiegewichtung wird vor fachlicher Freigabe nicht als eigener verbindlicher Prüfprozess ausgegeben.

**Quelle:** Angemessenheitsprüfung, PDF-Seiten 1–6; insbesondere Seiten 3 und 6 visuell geprüft.

### 4.5 Sparprämie, Risikoschutz und Prognose auseinanderhalten

Die LifeStar- und FondsStar-Muster enthalten garantierte Leistungen, Szenarien, Kosten, Rückkaufswerte und Zusatzversicherungen. Im FondsStar-Muster bezieht sich die viermonatige Befreiung bei Familienzuwachs auf Kosten- und Risikoprämien. Das darf nicht als vollständige Weiterzahlung der Sparprämie erklärt werden. Der Auszahlungsplan trennt garantierte von fondsabhängigen Auszahlungen und ist im Muster zeitlich befristet.

**Designentscheidung:** Keine Gleichsetzung von Fondsprognose und Garantie, von Einzahlung und Rückkaufswert oder von Auszahlungsplan und lebenslanger Rente. Vorzeitiger Ausstieg, Kosten und Flexibilität werden vor der Entscheidung sichtbar.

**Quellen:** LifeStar-Muster, PDF-Seiten 1–8; FondsStar-Muster, Seiten 1–3; Auszahlungsplan-Muster, Seiten 1–4.

### 4.6 Prämien und Deckungsvarianten verständlich erklären

Das EU-Muster weist CHF 811.50 Bruttoprämie und CHF 704.70 aktuell ermäßigte Jahresprämie aus. Die Ermäßigung ist nicht garantiert; auch EU-Prämien können laut Musterbedingungen angepasst werden. Quicksale und die technischen Unterlagen zeigen Varianten ohne Unfall- oder ohne Deckung psychischer Leiden sowie verschiedene Wartefristen.

**Designentscheidung:** Kein Ranking nur nach der niedrigsten sichtbaren Prämie. Ein Wechsel der Variante muss die Folgen für die analysierten Risiken zeigen. Die Nettoprämie wird nicht als dauerhaft garantierter Preis dargestellt. Musterpreise gelten ausschließlich für die jeweilige Musterperson und Konfiguration.

**Quellen:** EU-Muster, PDF-Seiten 1–4; technische SIR-Unterlagen; Quicksale-EDU-Prüfung. Die technischen SIR- und Todesfallblätter tragen ältere Stände aus 2023; deren Verbindlichkeit gegenüber neueren Bedingungen ist mit Pax zu klären.

### 4.7 Basisinformationen gehören zur Entscheidung

Bei der ergänzenden Suche im offiziellen Download-Center wurden zwölf weitere relevante PDFs gesichert: Basisinformationen zu LifeStar-/FondsStar-Varianten, Pax 3a und Auszahlungsplan, zwei angebotene UBS-Fondsunterlagen sowie Produktübersicht, Fondsübersicht und Fondsbroschüre. Die Basisinformationsblätter unterscheiden sich ausdrücklich von Werbematerial und erläutern Produktart, Risiken und Kosten.

**Designentscheidung:** Vor einer qualifizierten Produktempfehlung die zum konkreten Tarif passende Basisinformation mit Version zugänglich machen und im Beratungsdossier referenzieren. Fondsinformationen und versicherungsbezogene Informationen sind unterschiedliche Ebenen: Ein Fonds-Kostenausweis ersetzt nicht den gesamten Versicherungskostenausweis. Pax 3a bleibt eine eigene Produktkonfiguration; aus dessen digitalem Einstieg wird keine allgemeine Gleichsetzung mit anderen 3a-Verträgen abgeleitet.

**Quellen:** Zusätzliche PDFs im Inventar unter `references/products/key-information/` und `references/funds/`; insbesondere die ersten Seiten der Basisinformationen zu Pax 3a und FondsStarPlanInvest.

### 4.8 Nachgeladene Produktblätter und Medien

Die zwei nachgeladenen Produktblätter sind unter FondsStar und LifeStar abgelegt; beide wurden auf allen zwei Seiten visuell geprüft. Das LifeStar-Blatt unterscheidet neben Garantie- und Fondsanlage eine zusätzliche, variabel verzinste, im Produktblatt als „risikolos“ bezeichnete Anlage. Der Plan muss diese konkrete Anlagekomponente und ihre vertraglichen Regeln erfassen, statt alle Varianten auf einen einzigen Garantie-/Fonds-Schieberegler zu reduzieren. Umschichtungsmöglichkeiten und eine automatische Anpassung an 3a-Grenzbeträge sind getrennt von einer individuellen Tragbarkeit zu erklären.

Die 16 identifizierten Videodateien und 16 verfügbaren Untertiteldateien ergänzen die Quellenbasis, einschließlich der drei Quicksale-Anleitungen. Sie sind technisch auf lesbare Bild- und Tonstreams geprüft, aber nicht vollständig inhaltlich gesichtet. Erklärungen aus den Videos werden daher nicht ungeprüft als verbindliche Prozess- oder Vertragsregeln übernommen. Der Medienkatalog führt Quelle, Downloadstatus, Auflösung, Untertitel und Prüftiefe getrennt auf.

### 4.9 Aktuelle öffentliche Analyse als bestehende Referenz

Die öffentliche [Pax/vlot-Analyse](https://www.pax.ch/de/private-vorsorge/vorsorgeanalyse/embedded) wurde am 30.10.2026 mit einem erfundenen Paar und zwei Kindern bis zum 17-seitigen PDF-Export getestet. Bereits vorhanden sind ein Familienprofil, drei Säulen über Renten und Kapitalverzehr, Steuerbetrachtung, eine Lückenrangfolge und eine zeitversetzte Pensionierung. Der PoC muss seinen zusätzlichen Nutzen gegenüber diesem Ist-Stand zeigen. Die Challenge-Beschreibung einer ausschließlich menschlichen Beratung ist deshalb als Aufgabenbeschreibung und nicht als vollständige Bestandsaufnahme der aktuellen öffentlichen Website zu lesen.

Die LifeMap-Demo konzentriert sich auf gezielte Rückfragen, explizite Ziele und Tragbarkeit, gemeinsam veränderte Zukunftsszenarien mit erklärtem Vorher-/Nachher-Effekt sowie die Fallübergabe bis zur klar gekennzeichneten Demo-Police. Bestehende Säulentabellen und PDF-Export sind die Referenzbasis. vlot und Logismata dürfen weder fachlich noch technisch ohne Nachweis gleichgesetzt werden.

Die Referenz zeigt zwei ungeklärte Punkte: kleine Invaliditätslücken erscheinen in der Lösung als ohne Lücke, und der PDF-Export ist trotz durchlaufenem Abschluss als Entwurf mit unvollständigen Eingaben markiert. Unser Abnahmekriterium: Ergebnis, Empfehlung und Export müssen dieselbe Daten-/Annahmenversion, dieselbe Lücke und einen verständlichen Prüfstatus zeigen. Schwellenwerte und Schätzungen sind ausdrücklich zu erklären. Details, Testdaten und Grenzen stehen im [Testbericht](../reports/public-pension-analysis.md); die unveränderte Testauswertung ist keine fachlich freigegebene Kundenberatung.

## 5. Personas und Datenbasis

Es gibt zwei unterschiedliche Quellengruppen, die getrennt bleiben:

1. **Die drei Personas:** junges bzw. mittleres Erwachsenenalter als Einzelperson, verheiratetes Paar mit Baby und vermögendes Paar. Die Müller-Persona hat laut PDF CHF 20’000 Vermögen, CHF 100’000 Einkommen, einen voll arbeitenden Partner und eine nicht erwerbstätige Partnerin. Ob das Einkommen brutto oder netto gemeint ist, muss bestätigt werden.
2. **Die ausgefüllten Vorsorgeanalysen:** eigenständige Referenzfälle mit anderen Geburtsdaten, Einkommen und Vertragsangaben. Deren Zahlen dürfen nicht stillschweigend in die Müller-Persona übernommen werden.

In der vermögenden Persona stehen offenbar kopierte Müller-Bezeichnungen bei den Arbeitspensen. Das wird als Quellenunklarheit markiert und nicht automatisch Personen zugeordnet.

**Erster Entwicklungs-/Demo-Hauptfall:** die vollständig erfundene Familie TEST Nina / TEST Tom aus dem dokumentierten öffentlichen Test. Zusätzliche Budgetpositionen und Lebensziele liegen in einer getrennten synthetischen Fixture-Schicht. Die Müller-Persona bleibt Zielgruppen- und Fachreferenz; eine darauf beruhende zweite Demo-Version wird erst nach Kennzeichnung ihrer offenen Angaben ergänzt. Der Paar-Vorsorgecheck bleibt ein separater unveränderter Referenzfall. Details und Begründung stehen im Umsetzungsplan.

Gesundheitsdaten und echte Ausweiskopien werden für die Hackathon-Demo nicht benötigt. Die Originalunterlagen bleiben im autorisierten lokalen Arbeitsbereich und werden nicht ungeprüft an ein externes Modell übermittelt.

## 7. Finanz- und Szenariomodell

### Gemeinsame Regeln

- Personen und Haushalt besitzen stabile IDs; Geldbeträge haben Währung, Zeitraum sowie Brutto-/Netto-Bezug.
- Jeder Wert trägt Quelle, Quelldatum, Gültigkeit und Status `confirmed`, `estimated`, `unknown` oder `conflicting`.
- Leistungen haben Start, Ende, Ereignis, versicherte Person, Empfänger und Koordinationsregel. Kapital und laufendes Einkommen bleiben getrennt.
- Bereits für Eigenheim oder Notreserve vorgesehenes Kapital wird nicht nochmals vollständig für die Pensionierung verwendet.
- Pro Phase gilt konzeptionell: Lücke = bestätigter Bedarf minus anrechenbare, koordinierte Einnahmen; Überschuss und Unterdeckung werden getrennt ausgewiesen. Das ist die Darstellungslogik, keine Ersatzformel für komplexe Versicherungsansprüche.
- Prognosen trennen Nominalwerte, Kaufkraftannahmen, garantierte Komponenten und unsichere Renditen.

### Familie und Arbeitspensum

Vergleichen: heutige Situation, Rückkehr in Erwerbsarbeit, reduziertes Pensum und zusätzliche Betreuungskosten. Beide Partner werden einzeln und gemeinsam betrachtet. Auch der Ausfall unbezahlter Betreuung kann Ersatzkosten verursachen. Unterschiedliche Ereignisse sind Krankheit, Unfall und Tod jeder versicherten Person.

Logismata-Risikooperationen liefern acht bezeichnete Szenarien für zwei Personen. Die API-Struktur enthält Anzahl der Kinder, jedoch in diesen Risiko-Eingaben keinen vollständigen kindbezogenen Zeitplan. Der detaillierte Verlauf mit dem Ende einzelner Kinderleistungen wird deshalb nicht als bereits verfügbare API-Funktion behauptet. Dafür braucht es einen zusätzlichen, von Pax bestätigten Ereignis- und Regelansatz oder eine passende zusätzliche Schnittstelle.

### Eigenheim

Vergleichen: weiter mieten, später kaufen, Kauf mit dafür vorgesehenen liquiden Mitteln und – soweit zulässig – Vorbezug oder Verpfändung von Vorsorgewerten. Anzeigen: Kapitalbindung, laufende Wohnkosten, Rücklagen, Steuerwirkung und Veränderung der späteren Versorgung. Auch Tragbarkeit bei Tod oder Erwerbsunfähigkeit betrachten.

Die gelieferten 24 APICalc-Operationen enthalten keine ausdrücklich ausgewiesene Hypotheken-Tragbarkeitsoperation. Die offizielle Logismata-Weboberfläche zeigt zwar ein Wohnthema, daraus folgt aber keine für das Team verfügbare API. Im MVP wird ein transparentes Planungsmodell mit offengelegten, fachlich bestätigten Annahmen verwendet; es ist keine Finanzierungszusage. Produktbezogene Regeln für privilegierte Vorbezüge stammen aus den konkreten Bedingungen und dürfen nicht auf alle Guthaben verallgemeinert werden.

### Pensionierung

Vergleichen: unterschiedliche Erwerbsaufgabe je Partner, ordentliche bzw. frühere Pensionierung, private Beiträge und Kapitalverbrauch. Übergangsphase bis zur zweiten Pensionierung separat zeigen. Für die 3. Säule werden bestehendes Guthaben, Zahlungspläne, Verfügbarkeit, Garantien und Kosten zusätzlich zum AHV-/PK-Ergebnis integriert.

`calculateRetirementBase` ist laut Swagger auf Grundlagen beim regulären Pensionsalter bezogen; `calculateRetirement` enthält `DesiredRetirementAge`. Referenzfälle und Grenzfälle sind getrennt zu prüfen. Aus der API-Unterstützung folgt keine vollständige Modellierung jeder frühzeitigen Bezugskombination.

## 8. Empfehlungen: Bedarf vor Produkt

Vor einer Empfehlung müssen entscheidungsrelevante Angaben bestätigt, bestehende Deckungen berücksichtigt und die Finanzierbarkeit beurteilt sein. Eine fehlende geeignete Lösung wird offen benannt; der Advisor verspricht keine vollständige Marktberatung außerhalb seines freigegebenen Produktumfangs.

| Erkannter Bedarf | Möglicher Bezug zu Pax | Vorher zu prüfen |
|---|---|---|
| Wiederkehrende Einkommenslücke bei Erwerbsunfähigkeit | EU-/SIR-Varianten bzw. passende Zusatzdeckung | Krankheit/Unfall, Wartefrist, Vorleistungen, Tätigkeitsprofil, Ausschlüsse und Leistungsdefinition |
| Finanzielle Folgen eines Todesfalls | Konstantes/fallendes Todesfallkapital oder Hinterbliebenenrente | Begünstigung, Beziehungen, Restschuld, Dauer, vorhandene Leistungen und Kapitalbedarf |
| Langfristiger Aufbau mit gewähltem Garantieteil | LifeStar-Varianten | Individuelle Angemessenheit, Garantieumfang, Kosten, Laufzeit und Ausstieg |
| Langfristiger fondsgebundener Aufbau | FondsStar-Varianten | Verlustrisiko, Zeithorizont, persönliche Tragbarkeit, Rückkaufswerte und Zusatzdeckungen |
| Digitaler 3a-Einstieg | Pax 3a | Beitragsspielraum, Liquidität, Gesamtkosten und tatsächliche Vertragsbedingungen; nicht pauschal mit einem Quicksale-Tarif gleichsetzen |
| Geplanter Kapitalverzehr | Pax Auszahlungsplan | Laufzeit, garantierte vs. fondsabhängige Zahlungen, Kosten und verbleibendes Kapital |
| Bedarf des Kindes und Absicherung des Versorgers | Kinderversicherung/FirstStep | Konkrete Risiko-/Sparziele, bestehender Schutz und langfristige Verpflichtung |
| Organisatorische Vorsorgehilfe | Pax Care als ergänzender Service | Leistungsumfang; kein Ersatz für größere Versorgungslücken |

Jede Empfehlung zeigt: **Ziel → belegter Bedarf → bestehende Absicherung → vorgeschlagene Maßnahme → Produktmerkmale → Preis/Bindung/Risiko → Alternative → verbleibende Unsicherheit.**

Als Alternativen kommen z. B. höhere Liquiditätsreserve, Anpassung des Zielzeitpunkts, andere Sparaufteilung, bestätigter PK-Einkauf oder vorerst kein Neuabschluss in Betracht. Steuerersparnis allein begründet keine langfristige Versicherungspflicht.

Ein Produktkatalog enthält mindestens Tarif-ID, Produktfamilie, 3a/3b, Version/Gültigkeitsdatum, zulässige Kombinationen, Leistungsereignis, Wartefrist, Garantie, Kosten, Ausschlüsse, Laufzeit, Flexibilität und Quellenverweis. Broschüre, Tarifblatt und individuelle Offerte sind unterschiedliche Dokumenttypen. Bei Widerspruch wird keine automatische Regel erfunden.

## 10. Logismata-Integration: festgestellte Grenzen

- Basis: `https://baselhackathon2026.azurewebsites.net/viper`; Operationen per `POST /operation/standard/<operationId>` mit JSON und serverseitiger Bearer-Authentifizierung.
- `TaxLocationID` wird über die Ortssuche ermittelt. Ortsnamen, Kanton und Steuerdatenstand bleiben am Ergebnis nachvollziehbar.
- AHV-/PK-Grundlagen können in den Basisfunktionen approximiert sein. Eine Schätzung erhält niemals den Status „bestätigter PK-Ausweis“.
- Im Risiko-Schema bedeuten Szenarien 1–4 Erwerbsunfähigkeit/Krankheit, Erwerbsunfähigkeit/Unfall, Tod/Krankheit, Tod/Unfall für Person 1; 5–8 gelten für Person 2.
- **Offene Diskrepanz:** Das Risiko-Schema nennt `ErrorCode: 1` als OK, die erfassten Risiko-Beispiele liefern `0`. Das Pensionierungsbeispiel liefert `1`. Mit Logismata/Pax klären; bis dahin Antwortstatus, Szenariocode und Plausibilität gemeinsam prüfen und unklare Fälle als nicht validiert markieren.
- Die beobachteten 3a-Limits sind CHF 7’258 bzw. CHF 36’288 ohne P2. Die API-Antwort ist eine Rechengrundlage, keine vollständige Prüfung der individuellen Beitragsberechtigung und zulässigen Quote. Nicht dauerhaft hart codieren.
- Die OpenAPI verwendet für gewisse Funktionen Geschlecht und Geburtsjahr. Kundenangaben und für die Berechnung erforderliche Kategorien respektvoll unterscheiden; fehlende oder nicht abbildbare Fälle nicht erraten.
- HTTP 200 allein ist kein Nachweis für sachliche Richtigkeit, vollständige Eingaben oder regulatorische Angemessenheit.

Die vollständige Operationenliste, Pflichtfelder und archivierten Beispielantworten folgen im Anhang.

## 17. Fragen an Pax und Logismata

1. Welche Eingaben und Regeln sind für den gelieferten Studienfall verbindlich, und welche sind vereinfachte Musterannahmen?
2. Wie soll der Risiko-`ErrorCode` 0 gegenüber dem Swagger-Wert 1 behandelt werden?
3. Welche zusätzlichen Schnittstellen liefern zeitabhängige Kinder-, Taggeld-, UVG- und PK-Leistungsphasen?
4. Welche Rechen- oder Offertenschnittstelle unterstützt Hypotheken-Tragbarkeit, Vorbezug/Verpfändung und deren Vorsorgefolgen?
5. Welche aktuelle Tarif-/Bedingungsversion hat Vorrang, insbesondere bei technischen Blättern von 2023 gegenüber Mustern von 2026?
6. Welche Kriterien erfordern verbindlich menschliche Prüfung, und welche Empfehlungen darf ein digitaler Self-Service abgeben?
7. Wie wird die Angemessenheitsprüfung unverändert bzw. in einem freigegebenen digitalen Äquivalent eingebunden?
8. Welche unterstützte Übergabe existiert zu Quicksale, Digitalantrag, Signatur, Risikoprüfung und Kundenportal? Gibt es Sandbox, Rückmeldungen und Testpolicen?
9. Welche Anforderungen gelten für Identifizierung, Begünstigung, Geldwäschereiprüfung und individuelle Einwilligungen im konkreten Produktprozess?
10. Welche Modellumgebung, Datenlokation, Aufbewahrungsfristen und Protokollierung sind freigegeben?
11. Erhält das Team Zugriff auf `@paxch/pax-ui` und lizenzierte Schriften? Welche Markenassets dürfen im Prototyp verwendet werden?
12. Welche Erfolgskriterien bewertet Pax: Verständnis, ausreichende Versorgung, korrekte Übergabe, Abschlussbereitschaft, Bearbeitungszeit oder andere Größen?

