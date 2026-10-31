# Earnies Dialog-Extraktionsmodul

Status: ready-for-agent
Owner: Earnie
Stand: 31.10.2026
Basis: main, 9ab4e40
Testgrenzen: im Gespräch abgestimmt; Erstellung anschließend ausdrücklich beauftragt.

## Problem Statement

Die antwortende Person soll persönliche Angaben in einem Beratungsgespräch machen können, ohne dieselben Angaben zusätzlich in Fallfelder einzutragen. Das System muss erkennen, welche Person welche Angabe gemacht oder korrigiert hat, welche Information noch fehlt und wozu tatsächlich eine Zustimmung vorliegt.

Das gemeinsame Backend kann Feldvorschläge bereits als atomare Vorschlagspakete speichern, Unklarheiten verwalten und Kundenaktionen getrennt bestätigen. Earnies Dialog-Extraktionsmodul verbindet das Unterhaltungslog mit diesem vorhandenen Workflow. Eine vollständige Verbindung von finalem Gesprächsbeitrag über Modell und Aufnahme-Tool bis zum gemeinsamen Fall ist noch nicht nachgewiesen.

Besonders kritisch sind die Trennung von Jahresbrutto und Budget-Netto, Korrekturen an bereits erkannten Angaben, beantwortete Unklarheiten und gesprochene Zustimmung. Eine KI-Aussage darf keine Angabe der Person erzeugen. Ein erkanntes Einkommen ist zunächst ein Feldvorschlag. Die Annahme eines Pakets und die Bestätigung des Gesamtprofils bleiben zwei getrennte Kundenaktionen.

## Solution

Earnies Modul verarbeitet finalisierte Nutzeräußerungen zusammen mit dem rollengetrennten Unterhaltungslog und einem frisch geladenen, autorisierten Extraktionskontext. Es übermittelt eine kleine, ausdrücklich synthetische Projektion an OpenAI Responses. Das Modell liefert über das begrenzte Aufnahme-Tool Feldvorschläge und Unklarheiten; Earnies Code validiert das Ergebnis, ergänzt vertrauenswürdige Metadaten und reicht es beim zentralen Fallservice ein.

Die Person erhält einen nachvollziehbaren Änderungsvorschlag oder höchstens eine zusammengehörige Rückfrage. Ihre Antwort kann eine Unklarheit beantworten; fachlich aufgelöst wird diese erst durch die dafür vorgesehene Kundenaktion. Die Live-Anbindung verwendet den vorhandenen Bestätigungsworkflow und bindet gesprochene Antworten an die tatsächlich wiedergegebene Frage.

Der erste gemeinsame Durchlauf verarbeitet den Satz „Mein Bruttojahreseinkommen beträgt 119’000 Franken.“ für die vorbereitete synthetische Person `person_demo_1`. Er erzeugt genau einen unbestätigten Vorschlag über 11’900’000 Rappen im Versicherungs-Jahresbrutto. Das vorhandene Budget-Netto bleibt unverändert.

## User Stories

1. Als antwortende Person möchte ich Angaben im Gespräch machen können, damit ich sie nicht nochmals manuell in den Fall eintragen muss.
2. Als antwortende Person möchte ich, dass nur meine eigenen Aussagen als Angaben berücksichtigt werden, damit Fragen und Beispiele der KI nicht zu meinen Daten werden.
3. Als antwortende Person möchte ich, dass erst meine abgeschlossene Äußerung verarbeitet wird, damit vorläufige Transkriptfragmente keine falschen Vorschläge erzeugen.
4. Als antwortende Person möchte ich Text und Sprache für denselben Aufnahmeweg verwenden können, damit für beide Eingabearten dieselben fachlichen Regeln gelten.
5. Als antwortende Person möchte ich mein Bruttojahreseinkommen eindeutig angeben können, damit der richtige Jahresbetrag im richtigen Fallfeld vorgeschlagen wird.
6. Als antwortende Person möchte ich, dass eine Bruttoangabe mein Budget-Netto unverändert lässt, damit das System keine nicht genannten Nettowerte ableitet.
7. Als antwortende Person möchte ich Beträge in Franken nennen können, damit die technische Speicherung in Rappen nicht meine Aufgabe ist.
8. Als antwortende Person möchte ich bei fehlender Einkommensbasis oder Periode eine Rückfrage erhalten, damit das System keine Bedeutung errät.
9. Als antwortende Person möchte ich bei Monatsbrutto die Jahresbasis einschließlich zusätzlicher Monatslöhne klären können, damit kein falsches Jahresbrutto entsteht.
10. Als antwortende Person möchte ich Angaben zu meinem Partner eindeutig zuordnen können, damit keine Angabe versehentlich die andere Person verändert.
11. Als antwortende Person möchte ich, dass eine unklare Personenzuordnung zuerst geklärt wird, damit keine Identität aus Vermutungen entsteht.
12. Als antwortende Person möchte ich eine erkannte Angabe vor der Annahme korrigieren können, damit der aktuelle Vorschlag meine letzte eindeutige Aussage wiedergibt.
13. Als antwortende Person möchte ich bei einer Teilkorrektur die übrigen zusammengehörigen Angaben behalten, damit nichts unbemerkt verloren geht.
14. Als antwortende Person möchte ich auch eine bereits bestätigte Angabe korrigieren können, damit die Änderung erneut zur Annahme vorliegt und die Historie erhalten bleibt.
15. Als antwortende Person möchte ich widersprüchliche Aussagen klären können, damit das System nicht selbst entscheidet, welche Aussage gelten soll.
16. Als antwortende Person möchte ich höchstens eine zusammengehörige Rückfrage im nächsten passenden Turn erhalten, damit ich das Gespräch fortsetzen kann.
17. Als antwortende Person möchte ich eine Rückfrage beantworten können, damit meine Antwort als vollständiger Vorschlag zur Übernahme bereitsteht.
18. Als antwortende Person möchte ich eine bereits beantwortete Frage nicht nochmals hören, damit ich stattdessen über die Übernahme meiner Antwort entscheiden kann.
19. Als antwortende Person möchte ich zusammengehörige Änderungen als ein Paket prüfen und annehmen können, damit keine unvollständige Teilübernahme entsteht.
20. Als antwortende Person möchte ich eine vorgeschlagene Änderung ablehnen können, damit sie nicht in meinen Entwurf übernommen wird.
21. Als antwortende Person möchte ich zu einer konkret wiedergegebenen Bestätigungsfrage Ja sagen können, damit genau die vorgestellte Aktion ausgeführt wird.
22. Als antwortende Person möchte ich das Gesamtprofil gesondert bestätigen, damit die Annahme eines einzelnen Pakets nicht zugleich das gesamte Profil freigibt.
23. Als antwortende Person möchte ich, dass ein verspätetes oder mehrdeutiges Ja keine Änderung auslöst, damit meine Zustimmung ihren konkreten Bezug behält.
24. Als antwortende Person möchte ich nach einem technischen Fehler den letzten gültigen Stand behalten, damit ich Angaben nicht durch eine fehlgeschlagene Extraktion verliere.
25. Als antwortende Person möchte ich eine fehlgeschlagene Verarbeitung wiederholen können, damit daraus keine doppelten Vorschläge entstehen.
26. Als antwortende Person möchte ich, dass zwischenzeitliche Falländerungen berücksichtigt werden, damit ein verspätetes Modellergebnis keinen neueren Stand überschreibt.
27. Als antwortende Person möchte ich nachvollziehen können, dass die Demo erfundene Daten an einen externen Modellanbieter übermittelt, damit der Verarbeitungshinweis dem tatsächlichen Ablauf entspricht.
28. Als antwortende Person möchte ich nach einer angeforderten Übergabe an einen menschlichen Berater keine weiteren digitalen Aufnahmeaktionen erhalten, damit mein Gesprächsstopp respektiert wird.
29. Als Dario möchte ich finale Gesprächsbeiträge und die zugehörige Frage eindeutig übergeben können, damit Wiedergabe, Antwort und Fallaktion zusammenpassen.
30. Als Valentin möchte ich validierte Vorschlagspakete gegen den aktuellen Fallstand erhalten, damit Berechtigungen, Revisionen und Persistenz zentral durchgesetzt werden.
31. Als Earnie möchte ich die vorhandenen Runtime-Verträge verwenden, damit keine zweite Fallhaltung und keine abweichende Bestätigungslogik entstehen.
32. Als Entwicklungsteam möchte ich Modulverhalten reproduzierbar ohne externe Modellaufrufe testen, damit Fehlerfälle zuverlässig nachweisbar sind.
33. Als Entwicklungsteam möchte ich die echte synthetische Modellanbindung separat abnehmen, damit simulierte Modellantworten nicht als Nachweis der Extraktionsqualität gelten.
34. Als Entwicklungsteam möchte ich den vollständigen Voice-Ablauf gemeinsam prüfen, damit ein erfolgreicher Backend-Test nicht mit einer funktionierenden Sprachintegration verwechselt wird.

## Implementation Decisions

### Grundlage und Verantwortlichkeiten

- Die Integrationsvereinbarung ist fachlich maßgeblich. Ältere abweichende Interviewaussagen, insbesondere zum monatlichen Brutto-Testfeld und zu inzwischen implementierten Backend-Lücken, sind historische Notizen.
- Das Modul wird im vorhandenen NestJS-Prozess über `createLifeInsuranceApp(options, [ErniDialogModule])` registriert und verwendet `LIFE_RUNTIME`. HTTP bleibt eine Alternative bei späterer Prozessaufteilung; ein separater Dienst ist für diesen Umfang nicht erforderlich.
- Der zentrale Fallservice und sein verschlüsselter Store bleiben die einzige Quelle des verbindlichen Fallstands. Das Modul schreibt weder direkt in den Store noch in eine eigene Fallkopie.
- Earnie verantwortet Extraktion, synthetische Modellprojektion, Modellaufruf, Prompting, Output-Validierung, Aufnahme-Tool und Turn-Orchestrierung.
- Valentin verantwortet gemeinsame Runtime-Verträge, Berechtigungen, Fallmutation, Revisionen, Persistenz sowie Bestätigungsanforderungen und abgeleiteten Unklarheiten-Gesprächsstatus. Diese Grundlagen sind auf dem geprüften Main-Stand vorhanden und werden angeschlossen.
- Dario verantwortet finale Voice-Übergabe sowie Zuordnung von Frage, tatsächlicher Wiedergabe und gesprochener Antwort. Bestätigungsaufrufe werden durch den authentifizierten Kundenclient vermittelt; Dario erhält dafür keine Kunden-Zugangsdaten. Die Darstellung von Prüfstand und Hinweisen im Angular-Kundenclient bleibt bei dessen Besitzer.
- Alle beteiligten Module bauen denselben aktuellen Stand von `@pax/contracts`. Frontend-Mock-Verträge und lokale Voice-Antwortspeicher ersetzen diese Runtime-Verträge nicht.

### Dialogeingang und Ablauf

- Der externe Moduleingang verarbeitet einen gegen `VoiceLogSchema` validierten finalen Beitrag und den zugehörigen Unterhaltungslog-Kontext mit unterscheidbaren Sprecherrollen. `source=voice` und `source=text` verwenden denselben fachlichen Extraktionsweg. Partielle Transkripte und Roh-Audio sind kein Extraktionseingang.
- Der bestehende `VoiceLog` beschreibt den finalen Nutzerbeitrag; die Sprecherrollen des umgebenden Unterhaltungslogs werden separat im Dialogadapter erhalten. Der strikte gemeinsame Vertrag wird nicht durch zusätzliche ungeprüfte Eigenschaften umgangen.
- KI-Beiträge liefern Frage- und Gesprächskontext. Sie gelten nicht als eigenständige Angaben der Person. Eingebettete Anweisungen im Gespräch können keine Schreibrechte oder Bestätigungsaktionen erteilen.
- Vor jeder neuen Auswertung wird über `runtime.extraction.context(actor, caseId)` ein frischer, gegen `ExtractorContextSchema` validierter Kontext geladen. Der Actor kommt aus der serverseitigen Authentifizierung und ist an den Fall gebunden.
- Beiträge desselben Falls werden sequenziell verarbeitet. Die nächste inhaltliche Rückfrage wartet auf den verarbeiteten Stand des abgeschlossenen Turns. Bei Timeout bleibt der letzte gültige Stand erhalten und der Turn liefert einen sichtbaren, wiederholbaren Fehler.
- Vor einer neuen Antwort beziehungsweise Wiedergabe wird deren Zustandsbezug geprüft. Ein älterer Kontext darf nicht ungeprüft für den nächsten fachlichen Gesprächsschritt verwendet werden. Rückfragen erfolgen im nächsten passenden Antwortturn; die normale Aufnahme unterbricht keine laufende Nutzeräußerung.
- Liefert ein Turn weder neue Angaben noch Unklarheiten, entsteht kein leeres Vorschlagspaket. Ein Smalltalk-Turn oder eine bloße KI-Frage darf keine Falländerung erzeugen.

### Begrenzte synthetische Modellanbindung

- Der erste Modellweg ist ein direkter Responses-Aufruf mit strukturiertem Function Calling für genau das begrenzte Aufnahme-Tool `submit_intake_proposals`. Decisions ist ein später optional zu vergleichendes Gate und keine Voraussetzung.
- Der Modellpayload besteht ausschließlich aus einem erfundenen Gesprächsausschnitt, pseudonymen Personen-IDs, relevanten Feldwerten mit Einheit und Einkommensbasis, den für diesen Turn erlaubten Zielen sowie betreffenden Rückfragen. Bestehende Vorschläge werden nur insoweit projiziert, wie sie für eine Korrektur nötig sind.
- Das vollständige `ExtractorContext`-Objekt, Fallhistorie, Eigentümerdaten, Zugangs- und Provider-Tokens, Kundensitzung, Berechtigungen, Revisionen und Hashes werden nicht an das Modell weitergereicht. Nicht benötigte Handover- und Kontaktdaten gehören ebenfalls nicht in den Modellpayload.
- Ausschließlich ausdrücklich synthetische Eingaben dürfen diesen Adapter erreichen. Eine nachträgliche Pseudonymisierung realer Gesprächslogs genügt dafür nicht. Darios vorhandene Beispielgespräche werden daher nicht automatisch als synthetische Modell-Testdaten übernommen.
- Die bestehende Policy `noExternalAiTransferAuthorized=true` wird nicht als allgemeine Transferfreigabe interpretiert oder pauschal aufgehoben. Der Anschluss ergänzt den ausdrücklich begrenzten synthetischen Modelladapter und den dazu passenden Verarbeitungshinweis vor dem ersten externen Aufruf. Der synthetische Rechnertransfer bleibt davon getrennt.
- Vorhandene Hinweise, die ausdrücklich behaupten, es würden keine externen KI-Modelle aufgerufen, müssen für den aktivierten Extraktionsweg konsistent ergänzt werden. Der Hinweis beschreibt Anbieter, synthetischen Inhalt und Zweck der Extraktion; die Umsetzung darf keine Freigabe realer Daten suggerieren.
- Modellschlüssel bleiben serverseitig. Dialog- und Fallinhalte sowie Tokens werden nicht in offene Diagnoseausgaben geschrieben.
- Das konkrete verfügbare Startmodell und die gültige Anbieterschnittstelle werden beim Umsetzungsstart geprüft. Die fachlichen Abnahmekriterien gelten unabhängig vom ausgewählten Modell; diese Spezifikation setzt keine ungeprüfte Modell-ID voraus.

### Aufnahme-Tool und Feldsemantik

- Das Aufnahme-Tool kann nur Feldvorschläge und Unklarheiten einreichen. Es erhält keine frei wählbaren URLs, keine frei wählbaren Fall-IDs und keine Werkzeuge zur Annahme oder Profilbestätigung.
- Das Modell adressiert bestehende Personen über stabile Personen-IDs und Felder über die begrenzten fachlichen Ziele. Earnies Code bindet diese an die aktuellen freigegebenen API-Pfade aus `writablePaths` und prüft Pfad und Personenbezug zusammen. Eine Indexposition allein ist kein Identitätsnachweis.
- Der Pflichtumfang beginnt mit dem Versicherungs-Jahresbrutto vorhandener synthetischer Personen und den dazugehörigen Korrektur- und Unklarheitenfällen. Die breitere Backend-Positivliste ist keine automatische Ausweitung des Modellwerkzeugs auf alle Fallfelder.
- Im verbindlichen ersten Test enthält das Paket genau die Änderung `insurance.persons.0.grossAnnualIncomeCents`, `personId=person_demo_1`, `value=11900000`. Vor Kundenannahme bleiben Entwurf und bestätigtes Profil unverändert. Das Paket ist ein unbestätigter Feldvorschlag.
- `financial.persons.0.income` bleibt in diesem Test vollständig unverändert. Es bezeichnet im vorbereiteten Fall jährliches Netto nach Einkommenssteuer. Weder eine Brutto-Netto-Ableitung noch ein Umdeuten dieses Felds zu monatlichem Brutto ist zulässig.
- CHF-Beträge werden als ganzzahlige Rappen für das Ziel aufbereitet. Person, Betrag, Periode und Einkommensbasis müssen hinreichend geklärt sein. Unbekannte Angaben werden nicht erfunden.
- Aus Monatsbrutto entsteht erst nach Klärung der Jahresbasis einschließlich zusätzlicher Monatslöhne ein Jahresbrutto-Vorschlag. „Monatlich und brutto“ allein beantwortet die Frage nach einem 13. Monatslohn noch nicht.
- Bei unklarer Personenzuordnung wird zuerst nach der Person gefragt; es entsteht kein Vorschlag für eine geratene Person. Eine persistente Unklarheit muss einen vom Backend zulässigen Feld-/Personenbezug haben. Lässt sich dieser noch nicht bilden, bleibt die Zuordnungsfrage im Dialogkontext, bis ein gültiger Bezug vorliegt; keine erfundene Personen-ID oder beliebiger Speicherpfad.
- Das Modellresultat ist untrusted input. Toolname, Struktur, Werttyp, zulässige Ziele und Personenbezug werden geprüft. Danach setzt Earnies Code Nachrichten- und Quellenreferenzen, erwartete Fallrevision, Profilversion und Entwurfshash aus validiertem Eingang und frischem Kontext und validiert den vollständigen `ProposalBatchInputSchema`-Request.
- Zusammengehörige Änderungen und neue Unklarheiten werden gemeinsam über `runtime.extraction.proposeBatch()` eingereicht. Bei ungültigem Output oder fehlgeschlagenem Toolaufruf wird kein Teil eines Ergebnisses gespeichert. Der Fallservice prüft Autorisierung und den kombinierten resultierenden Entwurf erneut.

### Korrekturen, Unklarheiten und Konflikte

- Eine eindeutige Korrektur ersetzt einen offenen Vorgänger explizit über `supersedesBatchIds` beziehungsweise bei bestehendem Legacy-Vorschlag über `supersedesProposalIds`. Alle Änderungspfade eines ersetzten Pakets bleiben im Nachfolger vertreten; unveränderte zusammengehörige Werte gehen nicht verloren.
- Angenommene Pakete und bestätigte Profile werden nicht umgeschrieben. Änderungen daran erzeugen ein neues, erneut annehmbares Paket auf aktuellem Stand. Widersprüche ohne eindeutige Korrektur führen zu einer Unklarheit.
- Ein bloßes Nein ohne neuen Wert wird nicht als erfundener Ersatzbetrag interpretiert. Ein an die Paket-Bestätigungsanforderung gebundenes Nein verwendet den vorhandenen Kundenworkflow; dieser erhält das Paket als `rejected` und verändert den Entwurf nicht.
- Unklarheiten werden zentral mit stabilen serverseitigen IDs gespeichert. Eine passende Antwort referenziert die bestehenden IDs über `resolvesAmbiguityIds`; das Modell darf eine Unklarheit nicht eigenständig fachlich auflösen.
- Der vom Backend abgeleitete Gesprächsstatus wird übernommen: `needs_answer` führt zur Rückfrage; `awaiting_customer_acceptance` führt zum Angebot der Antwortübernahme; `resolved` erlaubt die Fortsetzung. Bei beantworteter Unklarheit bleibt der Fachstatus bis zur Kundenaktion `open`.
- `answerBatchId` und `pendingAcceptanceBatchIds` werden berücksichtigt. Ein fehlendes `nextQuestion` bedeutet bei ausstehender Annahme nicht, dass das Profil vollständig bestätigt ist. Wird das Antwortpaket ersetzt, abgelehnt oder veraltet, wird der aktuelle Status neu geladen.
- Identische Zustellung verwendet dieselbe Extraktionsnachrichten-ID und denselben validierten Paketinhalt. Der bestehende idempotente Backend-Aufruf darf kein zweites Paket erzeugen. Bei Wiederzustellung eines bereits verarbeiteten Voice-Beitrags darf nicht allein wegen eines neuen Modelloutputs eine weitere Mutation entstehen.
- Geänderte Inhalte unter derselben ID sind ein Konflikt. Eine bewusst neue Auswertung nach Kontextänderung erhält eine neue Extraktionsnachrichten-ID; die ursprüngliche Voice-Nachricht und der Turn bleiben über Quellenreferenzen zuordenbar.
- Bei `VERSION_CONFLICT`, `STALE_CONTEXT` oder `STALE_PROPOSAL` wird der Kontext neu geladen und der Beitrag sachlich neu ausgewertet. Eine aktuelle Revision darf nicht auf ein altes Modellergebnis geklebt werden. Berechtigungs- und Sitzungsfehler werden nicht als erfolgreiche Extraktion behandelt.
- Bei Modellfehler, Timeout, abgebrochenem oder ungültigem Output bleibt der bisherige Vorschlags- und Fallstand erhalten. Wiederholung ist möglich; bei unklarem Ausgang einer Speicherung wird zuerst der zentrale Zustand geprüft.

### Getrennte Kundenbestätigung und Dario-Anschluss

- Vorschlagsannahme und Profilbestätigung verwenden die vorhandenen Backend-Aktionen. Der Agent-Token bekommt keine zusätzlichen Bestätigungsrechte; das Modell entscheidet weder über eine Annahme noch über eine Datenfreigabe.
- Für Voice erzeugt der authentifizierte Kundenclient eine serverseitige Bestätigungsanforderung mit genau einem Ziel: `accept_batch` mit Paket-ID oder `confirm_profile`. Fall, Kundensitzung, aktuelle Basis und genaue Frage sind gebunden; die bestehende kurze Ablaufzeit wird respektiert.
- Der serverseitige Fragetext wird unverändert wiedergegeben. Der Kundenclient zeigt den zugehörigen Prüfstand an; bei Gesamtprofilbestätigung zusätzlich Profil, Annahmen und Verarbeitungshinweis. Erst nach tatsächlichem Playback-`ended` darf die Voice-Darstellung als erfolgt gemeldet werden. Unterbrechung oder TTS-Fehler gelten nicht als abgeschlossene Wiedergabe.
- Dario ordnet die finale Antwort bereits bei ihrer Erzeugung der Frage zu. Die vorhandenen Bindungen einschließlich `questionId`, Fragehash, Turn-/Reply-Referenzen und `VoiceLog.correlationId` werden unverändert weitergegeben. Ein früheres allgemeines Ja wird nicht nachträglich umetikettiert.
- Das erste passende Ja übernimmt genau das Paket in den Entwurf. Eine gegebenenfalls zugehörige Unklarheit wird damit aufgelöst; das Gesamtprofil bleibt unbestätigt. Erst eine neue Anforderung mit einer neuen Antwort bestätigt das Gesamtprofil. Derselbe Antwortbeitrag darf beide Aktionen niemals auslösen.
- Änderungen am Fall und neue Bestätigungsfragen invalidieren alte Anforderungen. Bei anderer neuer Gesprächsfrage oder Abbruch meldet der Kundenclient zusätzlich den vorhandenen Cancel-Schritt, bevor er fortfährt; das Backend erkennt solche anderweitigen Fragen nicht von selbst.
- Mehrdeutige, abgelaufene, fremde oder wiederverwendete Antworten lösen keine Annahme aus. Unterstützt der vorhandene Voice-Renderer eine Änderung nicht, wird der vorhandene Screen-Weg genutzt; keine frei erfundene Voice-Zusammenfassung.

### Bestehenden Gesprächsstopp respektieren

- `ExtractorContext.handover` und das gemeinsame Stoppsignal werden respektiert. Bei `stopDigitalConversation=true` beginnt kein neuer Modell-/Tool-Turn. Bei Übergabe oder erhöhter Übergaberevision wird ein laufender Turn abgebrochen und ein verspätetes Ergebnis verworfen, auch wenn der Kunde inzwischen wieder digital fortsetzt.
- Die vorhandene Sperre `HUMAN_HANDOVER_ACTIVE` wird nicht umgangen. Nach ausdrücklicher Wiederaufnahme beginnt ein neuer Turn mit frischem Kontext. Der Aufbau von Übergabe-UI, Telefonie oder einer neuen Handover-Logik gehört nicht zu diesem Modul.

## Testing Decisions

### Abgestimmte Grenzen und vorhandene Vorbilder

- Die abgestimmte Hauptgrenze ist der vollständige Dialog-Turn: finaler Nutzerbeitrag plus rollengetrennter Unterhaltungslog und aktueller Extraktionskontext hinein, beobachtbarer Vorschlags-/Unklarheiten- und Fallstand heraus. Der Test verwendet Earnies tatsächliche Orchestrierung und den echten gemeinsamen Fallservice; ausschließlich der externe Modelltransport wird kontrolliert simuliert.
- Ein guter Test prüft fachliches Verhalten, unveränderte Daten und verbotene Seiteneffekte. Er prüft keine privaten Helfer, keinen exakten Promptwortlaut und keine interne Aufrufreihenfolge. Fehler des Providers lassen sich an derselben Modellgrenze auslösen; eine zusätzliche Architektur nur für Tests ist nicht erforderlich.
- Vorbilder sind die bestehenden Node-Tests des Extraktionsworkflows und der Kundenbestätigungen: echte Runtime, synthetischer Testprovider, temporärer verschlüsselter Store, reale Kunden-/Agentrollen und Schema-Validierung. Die bestehenden Shared-Contracts- und Nest-Integrationstests sichern Vertrags- und Authentifizierungsverhalten ab.
- Bestehende Backend-Tests werden wiederverwendet und bei nötig geänderter Integration ergänzt. Earnies Tests beweisen zusätzlich, dass sein Dialogeingang diese Verträge korrekt bedient; Valentins sämtliche internen Tests werden nicht dupliziert.

### Automatisierte Modulabnahme ohne externe Dienste

| Fall | Eingabe oder Störung | Beobachtbare Erwartung |
|---|---|---|
| Jahresbrutto | „Mein Bruttojahreseinkommen beträgt 119’000 Franken.“ | Genau ein vorgeschlagenes Versicherungs-Jahresbrutto von 11’900’000 Rappen für `person_demo_1`; Budget-Netto, Entwurf und bestätigte Historie bleiben vor Annahme unverändert. |
| Sprecherrollen | Die KI nennt einen Beispielbetrag; die Person macht keine entsprechende Angabe. | Kein Feldvorschlag aus der KI-Aussage. |
| Eingabegrenze | Partielles Transkript, ungültiger VoiceLog oder Roh-Audio. | Abweisung vor Modell-/Fallmutation; finaler Textbeitrag verwendet denselben fachlichen Weg wie Voice. |
| Kein Aufnahmeinhalt | Smalltalk ohne relevante neue Angabe. | Kein leeres Paket und keine Fallmutation. |
| Eindeutige Korrektur | Nach offenem Jahresbrutto-Vorschlag: „Nein, ich meinte 125’000 im Jahr, brutto.“ | Neuer Vorschlag über 12’500’000 Rappen ersetzt den offenen Vorgänger explizit; der alte ist nicht mehr annehmbar. |
| Zusammengehörige Teilkorrektur | Ein vorhandenes Paket enthält mehrere Angaben; nur eine wird korrigiert. | Nachfolger erhält alle benötigten Vorgängerpfade mit den unveränderten übrigen Angaben; kein stiller Datenverlust. |
| Bestätigte Angabe | Eindeutige Korrektur eines bereits bestätigten Jahresbruttos. | Neues unbestätigtes Paket; bestätigter Snapshot bleibt unverändert. |
| Unklare Partnerangabe | „Mein Partner verdient 6’000.“ mit fehlender Basis/Periode beziehungsweise uneindeutiger Person. | Keine geratene Zuordnung oder Jahres-/Nettoableitung; passende Rückfrage mit zulässigem Bezug, sobald dieser feststeht. |
| Monatsbasis | „Monatlich und brutto.“ auf die Rückfrage; zusätzliche Monatslöhne noch unbekannt. | Noch kein angenommener Jahresbetrag; Jahresbasis einschließlich 13. Monatslohn bleibt zu klären. |
| Vollständige Klärung | Synthetischer Dialog nennt 6’000 CHF monatlich brutto und ausdrücklich 13 gleich hohe Monatslöhne. | Vorschlag über 7’800’000 Rappen Jahresbrutto für die eindeutig zugeordnete Person; Budget-Netto unverändert. |
| Beantwortete Unklarheit | Vollständige Antwort erzeugt ein gültiges Paket mit `resolvesAmbiguityIds`. | Fachlich weiter `open`, Gesprächsstatus `awaiting_customer_acceptance`; die ursprüngliche Frage wird nicht nochmals gestellt. Erst Kundenannahme führt zu `resolved`. |
| Veraltete Antwort | Antwortpaket wird ersetzt, abgelehnt oder seine Basis geändert. | Frische Backend-Projektion bestimmt den Gesprächsschritt; ein veraltetes Paket löst keine Unklarheit vorzeitig auf. |
| Widerspruch | Zwei Angaben lassen sich nicht eindeutig als Korrektur zuordnen. | Rückfrage statt eigenständiger Auswahl eines Werts. |
| Duplikat | Derselbe Turn beziehungsweise identischer Paketrequest wird wieder zugestellt. | Ein fachlicher Vorgang, keine doppelten Pakete oder Unklarheiten und keine zusätzliche Mutation. |
| Versionswechsel | Während des Modellaufrufs wird der Fall anderweitig geändert. | Altes Ergebnis wird nicht mit aktualisierten Metadaten gespeichert; Neu-Laden und sachliche Neuauswertung. |
| Fehler und Timeout | Modell verweigert, antwortet unvollständig/ungültig oder verspätet; Toolaufruf scheitert. | Keine Teilpersistenz; letzter gültiger Stand bleibt erhalten; sichtbarer Fehler und wiederholbarer Turn. |
| Unzulässiges Toolziel | Modell liefert fremde Person, unzulässigen Pfad, Bestätigungsmetadaten oder eine andere Aktion. | Abweisung ohne Fallmutation und ohne zusätzliche Rechte. |
| Synthetische Projektion | Kontrollierter Transport erfasst den tatsächlich ausgehenden Modellpayload. | Nur ausdrücklich erfundener Gesprächsausschnitt und erlaubte relevante Angaben; keine Sitzungen, Rechte, Hashes, Revisionen oder vollständiger Kontext. Nicht synthetischer Eingang erreicht den Transport nicht. |
| Gesprächsstopp | Übergabe während des Modellaufrufs, gegebenenfalls unmittelbar gefolgt von Resume. | Kein späterer Feldvorschlag aus dem alten Turn; nach Resume nur neuer Turn auf frischer Basis. |

### Separater synthetischer OpenAI-Abnahmelauf

- Ein ausdrücklich gestarteter Lauf mit dem echten synthetischen Modelladapter prüft dieselben fachlichen Beispiele für Jahresbrutto, Korrektur, Partner-/Basisunklarheit und vollständige Klärung. Er weist die tatsächliche Extraktionsqualität und den Tool-Vertrag nach, nicht nur die Verarbeitung vorgefertigter Modellantworten.
- Dieser Lauf gehört nicht zur normalen automatisierten Testsuite. Er verwendet ausschließlich eigens erfundene Dialog-/Falldaten, serverseitige Schlüssel und den ergänzten Verarbeitungshinweis. Er benötigt keine echten Kunden- oder Voice-Beispiellogs und keine Live-Rechneraufrufe.
- Maßgeblich sind Werte, Zielperson, Feldsemantik, nötige Rückfragen und ausbleibende unzulässige Änderungen; der natürliche Wortlaut muss nicht exakt übereinstimmen. Verwendetes Modell, Fallausgänge und beobachtete Laufzeit werden dokumentiert. Es wird kein bislang unvereinbartes numerisches Latenzziel erfunden.
- Die im automatisierten Test geprüfte Payload-Grenze gilt unverändert für den echten Adapter. Ein Erfolg mit simuliertem Modelloutput ersetzt diesen Abnahmenachweis nicht.

### Gemeinsame Integrationsabnahme mit Dario

- Der vollständige Weg wird gemeinsam nachgewiesen: finale synthetische Äußerung → Earnies Modell-/Tool-Weg → zentrales Vorschlagspaket → angezeigter Prüfstand und tatsächlich wiedergegebene Bestätigungsfrage → gebundene neue Antwort → Paketannahme → separat dargestelltes Gesamtprofil mit Annahmen/Hinweis → zweite Frage und zweite Antwort → neue bestätigte Profilversion.
- Nach dem ersten Ja ist nur das Paket übernommen; Budget-Netto bleibt unverändert und eine neue bestätigte Profilversion entsteht erst nach der zweiten Antwort. Eine anschließende Berechnung wird, soweit Teil des gemeinsamen Durchlaufs, mit dem vorhandenen synthetischen Testprovider gegen diese neue Profilversion geprüft.
- Negative Fälle umfassen unterbrochene Wiedergabe, TTS-Fehler, eine andere neue Gesprächsfrage, falsche Fragebindung, allgemeines/mehrdeutiges Ja, Ablauf, verspätete Antwort, Wiederverwendung derselben Antwort sowie Falländerung zwischen Frage und Antwort. Keiner dieser Fälle darf eine unbeabsichtigte Bestätigung erzeugen.
- Der vorhandene Backend-Durchlauf für Voice-Bestätigung liefert Vorbilder und simulierte Vertragsnachweise. Er ist kein Beleg für echte STT/TTS-Callbacks, die Kundenanzeige oder die integrierte Extraktion. Solange diese Anschlüsse fehlen, bleibt die gemeinsame Abnahme ausstehend.
- Nach Implementierung sind die relevanten neuen Modultests und die bestehende Backend-Testsuite einschließlich Build, Client-Typprüfung und Vertragsprüfung auszuführen. Die vorhandenen Extraktions- und Voice-Bestätigungsdemos können den lokalen gemeinsamen Durchlauf ergänzen. Die Erstellung dieser Spezifikation selbst führt keine Implementierungs- oder Live-Abnahme aus.

## Out of Scope

- Entscheidungen aus dem abgeschlossenen Interview neu verhandeln; ältere widersprechende Notizen wieder als offene Grundsatzfragen behandeln.
- Automatische Bestätigung erkannter Angaben, Profilmutation durch das Modell oder zusätzliche Bestätigungsrechte für den Agenten.
- Reale Kunden-, Gesundheits- oder Finanzdaten an externe Modelle übertragen; bloß pseudonymisierte reale Gesprächslogs als synthetisch deklarieren.
- Das gesamte Fallprofil erfassen, beliebige freigegebene Backend-Felder modellseitig öffnen, neue Personen-/Haushaltsstrukturen initialisieren oder einen allgemeinen Fragebogen-Extraktor bauen.
- Budget-Netto aus Brutto berechnen, zusätzliche Monatslöhne vermuten, Renten/Prämien erfinden, fachliche Finanzberechnungen oder Empfehlungen implementieren.
- Eine zweite Datenbank, separate Fallhaltung, neuer Microservice, allgemeine Tool-Routing-Plattform oder redundante Bestätigungs-/Unklarheitenverwaltung.
- Decisions als Pflichtpfad, automatischer Anbieter-Fallback oder Auswahl zusätzlicher Modellanbieter. Ein späterer Vergleich kann dieselben Abnahmebeispiele verwenden.
- Vollständiger Umbau von Darios eigenständiger Voice-Demo, STT/TTS-Provider, Avatar, Angular-HTTP/SSE-Adapter oder Fall-Prüfansichten durch Earnie. Der erforderliche Anschluss und die gemeinsame Abnahme bleiben explizite Abhängigkeiten der jeweiligen Besitzer.
- Neuimplementierung der menschlichen Übergabe, Telefonanwahl, Beratervermittlung oder externe Nachrichten.
- Verbindliches Latenz-SLA, Lasttest mehrerer Backend-Instanzen, produktiver Rollout oder öffentliche Veröffentlichung.
- Tickets erzeugen, Commits, Pushes, externe Issues oder Branch-Merges im Rahmen dieser Spezifikation.

## Further Notes

### Geprüfter Stand und Abhängigkeiten

- Statisch geprüfter Checkout: `main` und lokale Referenz `origin/main` auf `9ab4e40`. Die früheren Basisstände `f1048c2` und `d0acc10` sind überholt. Die alte Remote-Tracking-Referenz `origin/feature/life-insurance-live-backend` auf `563a187` ist keine vollständig aktuelle Implementierungsbasis mehr.
- Die gemeinsame Backend-Basis einschließlich atomarer Pakete und Unklarheiten ist integriert. Die Bestätigungsanforderungen und der abgeleitete Gesprächsstatus sind seit `4e02151` vorhanden. Der aktuelle Stand ergänzt den gemeinsamen menschlichen Übergabe-/Stoppvertrag. Aussagen der Integrationsvereinbarung, diese Teile seien noch zu ergänzen, beschreiben den damaligen Implementierungsstand; die fachlichen Regeln gelten weiter.
- `ErniDialogModule`, synthetischer Modelladapter, Aufnahme-Tool und der vollständige gemeinsame Turn sind hier als umzusetzender Umfang beschrieben. Diese Spezifikation weist sie weder als bereits implementiert noch als getestet aus und startet keine Implementierung.
- Die lokale Voice-Referenz `origin/feature/voice` steht auf `a00f48f`. Die dortige Demo beschreibt eigene Transkript-Extraktion und lokale Antworten. Das ist kein Nachweis des gemeinsamen `VoiceLog`-/Vorschlagspaket-/Bestätigungsablaufs. Beim Anschluss sind Darios finale Turn-Übergabe und Frage-/Playback-Zuordnung mit dem Kundenclient zu vervollständigen; eine lokale Antwortmarkierung wird nicht als bestätigte Fallangabe importiert.
- Der Angular-Datenquellen-Provider wirft im Modus `api` weiterhin einen Fehler; der vorhandene Mock beweist keine Live-Anbindung. Der ergänzte synthetische Verarbeitungshinweis und der Kunden-/Voice-Anschluss sind daher konkrete Integrationsabhängigkeiten für die vollständige Abnahme.
- Im geprüften Checkout sind keine ADRs unter `docs/adr/` und keine `GLOSSARY-MAP.md` vorhanden. Das bestehende Glossar wird verwendet; neue ADRs oder Glossaränderungen sind für diese Spezifikation nicht erforderlich.
- Es wurden lokale Branchreferenzen und Quelltexte gelesen. Kein Fetch, Merge, Checkout-Wechsel, Testlauf oder externer Modellaufruf wurde für die Erstellung ausgeführt. Der tatsächliche Implementierungsstand und das Startmodell werden vor der Umsetzung erneut geprüft.

### Reihenfolge für die anschließende Ticketzerlegung

1. Aktuellen gemeinsamen Backend-/Vertragsstand als Basis prüfen; vorhandene Funktionalität wiederverwenden.
2. Earnies Dialogeingang, synthetische Projektion, Modelladapter, Verarbeitungshinweis und begrenztes Aufnahme-Tool bis zum verbindlichen Jahresbrutto-Fall verbinden.
3. Korrektur-, Unklarheiten-, Idempotenz-, Versions-, Fehler- und Stoppfälle an derselben Modulgrenze vervollständigen.
4. Vorhandene Bestätigungs- und Gesprächsstatusverträge mit Dario und dem Kundenclient anschließen; Zuständigkeiten bei der Zerlegung erhalten.
5. Automatisierte Modulabnahme, separaten synthetischen Modelllauf und gemeinsame zweistufige Voice-Abnahme nachweisen. Die erste erfolgreiche Bruttoextraktion allein schließt die Spezifikation nicht ab.

Das Entscheidungsinterview ist abgeschlossen. Konkretes Startmodell, numerisches Timeout und Ausführungszeitpunkt sind Implementierungsparameter, keine erneut offenen Architekturentscheidungen. Der Timeout muss endlich sein und das oben festgelegte Fehlerverhalten erfüllen.

### Quellen und Fortsetzung

- [Maßgebliche Integrationsvereinbarung](integration-agreement.md)
- [Abgeschlossenes Interview und historische Entscheidungen](interview-decisions.md)
- [Historische Fragen an Valentin mit Abschlussvermerk](questions-for-valentin.md)
- [Domain-Glossar](../../GLOSSARY.md)
- [Backend-Anschluss für Earnie](../../documentation/baselhack/plans/erni-extractor-integration.md)
- [Gebundene Voice-Bestätigung und Gesprächsstatus](../../documentation/baselhack/plans/voice-confirmation-and-dialogue.md)
- [Bestehender menschlicher Übergabe-/Stoppvertrag](../../documentation/baselhack/plans/human-advisor-handover.md)
- [Vorhandene Extraktionsworkflow-Tests](../../code/tests/extraction-workflow.test.mjs)
- [Vorhandene Kundenbestätigungstests](../../code/tests/customer-confirmations.test.mjs)
- [Vorhandene Shared-Contracts-Tests](../../code/tests/shared-contracts.test.mjs)
- [Vorhandene Handover-Tests](../../code/tests/human-handover.test.mjs)

Diese Datei wurde zunächst lokal im Markdown-Tracker als Grundlage für `/to-tickets` veröffentlicht. Zum Zeitpunkt der Spezifikation waren noch keine Tickets angelegt. Inzwischen liegen die [Ticketübersicht](map.md) und elf Tickets vor; auf anschließenden Nutzerauftrag werden sie samt Quellen auf `docs/ernest-ai-backend-tickets` versioniert. Ein anderer Checkout benötigt diesen Branch, um denselben Ticket- und Spezifikationsstand zu laden; der ursprüngliche lokale `.scratch/`-Ausschluss verhindert das Laden versionierter Dateien nicht.
