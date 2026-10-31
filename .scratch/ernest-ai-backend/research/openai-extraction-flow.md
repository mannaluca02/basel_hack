# Pax LifeMap: OpenAI-Extraktion aus finalisierten Dialogturns

Stand: 31.10.2026. Ausschließlich öffentlich zugängliche OpenAI-Primärquellen, per read-only Webabruf geprüft. Keine API-Keys, Inferenzaufrufe oder kostenpflichtigen Tests. Dies ist eine Research-Notiz mit Architekturabwägungen, kein freigegebener Konfigurationsentwurf.

## Kurzfazit

- **Belegt:** Die Nutzer-URL ist erreichbar und liefert den Guide **„Decisions“ zur Decisions API**, keinen 404. Offizieller Endpoint: `POST /v1/decisions`; derzeit einzig unterstütztes Modell: `gpt-6-luna`. Die genaue Produktbezeichnung ist **Decisions API** (Plural). [S1]
- **Belegt:** Decisions ist ein Evaluations-/Klassifikationsendpoint mit `predicate`, `choice` und `score`, kein Generator beliebiger Extraktionsobjekte. Der Guide empfiehlt für eigene JSON-Schemata einschließlich extrahierter Felder ausdrücklich **Responses API + Structured Outputs**. JSON als Input erweitert nicht das Ausgabeformat. [S1]
- **Empfehlung:** Für LifeMap zunächst **ein zusätzlicher Responses-Extraktionscall pro finalisiertem Dialogpaket**, der Feldvorschläge und strukturierte Unklarheiten gemeinsam liefert. Decisions nur ergänzen, wenn ein messbar nützliches Routing-/Bewertungsproblem mit vorgegebenen Optionen existiert. Grundlage: Produktgrenzen und OpenAIs Empfehlung, zusammengehörige Schritte zur Latenzsenkung zu bündeln. [S1, S2, S5]

## 1. Belegte Fakten: Welches Produkt kann was?

| Verfahren | Belegte Leistung / Grenze | Bedeutung für LifeMap |
| --- | --- | --- |
| **Decisions API** | Gemeinsame Evidenz als Text, Bilder, JSON oder geordnete Konversation inkl. Tool-Items; Antwort `answers`. `predicate`: Wahrscheinlichkeit; `choice`: eine vorgegebene Option; `score`: Bewertung über geordnete Stufen. 1–400 Fragen je Request; abhängige Entscheidungen benötigen getrennte Requests. Kein Audio-/Dateiinput. [S1] | Geeignet für „betrifft Feld X?“, „welche vorgegebene Feldkategorie?“ oder „Konflikt vorhanden?“. Nicht ausreichend für neue Namen, Beträge, Datumswerte und frei formulierte Unklarheiten. Diese Eignungsbewertung ist eine Ableitung aus den dokumentierten Ausgabetypen. |
| **Responses API + Structured Outputs** | Schema-konforme strukturierte Ausgabe über `text.format` mit `type: json_schema`, `strict: true`; unterstützt verschachtelte Objekte und Arrays. JSON Mode garantiert dagegen nur gültiges JSON. Der Guide zeigt explizit strukturierte Datenextraktion. [S2] | Passendes Verfahren für gemeinsame Ausgabe von Feldvorschlägen und einem Array strukturierter Unklarheiten. |
| **Function calling / tool calling** | Modell fordert einen Toolaufruf mit Argumenten an; Anwendung führt ihn aus. `strict: true` nutzt Structured Outputs zur Einhaltung des Funktionsschemas. Objekte benötigen `additionalProperties: false`, Properties müssen required sein; optionale Werte lassen sich nullable modellieren. Der vollständige Tool-/Antwortzyklus kann weitere Modellrequests enthalten. [S3] | Sinnvoll, wenn das Modell tatsächlich eine Anwendungsfunktion anfordern soll. Für reine Extraktionsdaten ist `text.format` direkter. Ein bloßes Auslesen der Argumente benötigt nicht automatisch eine zweite Generierung; die dokumentierte zweite Generierung dient der Antwort nach dem Toolergebnis. [S2, S3] |
| **Realtime API / Transkription** | Realtime ermöglicht Audio-/Textdialoge. Transcription-Sessions liefern Transkripttext ohne gesprochene Assistentenantwort; Transkriptdeltas und finale Transkripte sind eigene Ereignisse. [S4, S6] | Gesprächstransport und Transkription liefern Eingangsdaten; daraus folgt noch keine fachliche Feldextraktion. Diese bleibt ein separater Verarbeitungsschritt. |

**Wichtige Grenze:** Schemaeinhaltung ist keine Zusicherung inhaltlicher Richtigkeit. Der Structured-Outputs-Guide beschreibt weiterhin mögliche Fehler sowie Refusals und unvollständige Ausgaben, etwa bei Tokenlimits. Auch Decisions kann Refusals zurückgeben; Schwellenwerte sollen anhand gelabelter Anwendungsbeispiele bestimmt werden. [S1, S2]

## 2. Finalisierte Turns gegenüber laufender Inkrement-Extraktion

### Belegt

- Bei Realtime-Transkription kennzeichnet `conversation.item.input_audio_transcription.completed` das finale Transkript eines committed Input-Items; `.delta` liefert Zwischentext. Abschlüsse unterschiedlicher Sprachturns können in anderer Reihenfolge eintreffen: Zuordnung über `item_id`, nicht Ankunftsreihenfolge. [S4]
- Die aktuelle Empfehlung für reine Live-Transkription lautet `gpt-live-transcribe`. In dessen Transcription-Session muss die Anwendung Turns committen; `server_vad` und `semantic_vad` werden dort nicht unterstützt. Dies ist nicht mit den VAD-Fähigkeiten einer Realtime-Konversationssession gleichzusetzen. [S4, S6]
- Realtime-Konversationen liefern u. a. `response.output_text.done`, `response.output_audio_transcript.done` und `response.done`. Ein terminales `response.done` muss auf erfolgreichen Status geprüft werden; Abbruch/Fehler ist kein erfolgreich finalisierter KI-Turn. [S6]
- Es gibt inzwischen eine **native Decisions-Integration in GPT-Live**, mit Delegation oder Triggern auf Input-/Output-Transkriptdeltas. Live kann Decisions direkt aufrufen und damit einen App-Roundtrip sparen. Ergebnisse können außer Reihenfolge eintreffen; die Integration bleibt auf Decisions-Antworttypen begrenzt. Das ist ausdrücklich GPT-Live-Dokumentation und kein pauschaler Nachweis derselben Integration für jede Realtime-Session. [S7, S1]

### Empfehlung für LifeMap

Finalisierte KI- und Personenbeiträge mit Rollen und stabilen IDs als zusammenhängendes Evidenzpaket verarbeiten. „Ja“ benötigt beispielsweise die vorangegangene KI-Frage. KI-Aussagen liefern Kontext, dürfen aber nicht ohne Bestätigung als Nutzerfakten gelten. Bei unterbrochener Sprachausgabe muss fachlich geklärt werden, welcher tatsächlich gehörte Teil zum Dialog gehört. Grundlage sind die dokumentierten getrennten Items und Abschlussereignisse; diese Evidenzregeln sind LifeMap-Empfehlungen, keine API-Garantien. [S4, S6]

**Inkrementell auf Anwendungsebene** bedeutet hier: nach jedem finalisierten Paket nur neue/berichtigte Vorschläge und Unklarheiten gegen einen aktuellen Zustandsausschnitt ermitteln. Nicht bei jedem Tokenfragment extrahieren. Falls Vorab-Vorschauen auf Deltas gewünscht werden, sollten sie vorläufig und revidierbar bleiben und nach Turnabschluss neu abgeglichen werden. OpenAI dokumentiert die Revision partieller Transkripte und empfiehlt Tests mit realem Audio. [S4] Deduplizierung, Zustandsversionen und Verwerfen veralteter Ergebnisse sind daraus abgeleitete Anwendungsempfehlungen.

## 3. Ein versus zwei Calls – Forschungsbewertung, keine Freigabe

„Ein Call“ zählt im Folgenden nur die **zusätzliche fachliche Extraktion**, nicht Gesprächsgenerierung oder Audio-/Transkriptkosten.

| Variante | Bewertung / Trade-off |
| --- | --- |
| **1× Responses: Dialog + relevanter Zustand + Feldkatalog → Feldvorschläge und Unklarheiten gemeinsam** | **Empfohlene Baseline.** Keine separate Modellrunde nur für Kontextpakete oder Feldzuordnung erforderlich. Quellenbezug: Responses kann das eigene Ausgabeobjekt erzeugen; weniger Requests sparen Roundtrip-Latenz. Qualität und reale Latenz bleiben zu messen. [S1, S2, S5] |
| **Responses extrahiert Kontextpakete → Decisions ordnet Felder zu** | Möglich, wenn ein Paket bereits einen Wert enthält und nur die Auswahl einer festen Feld-ID fehlt. Decisions erzeugt dabei weder den Wert noch eine frei strukturierte Unklarheitenliste. Bei mehreren Aussagen sind getrennte Zuordnungsfragen nötig, ggf. mit „keine/unklar“-Option; weitere Bewertungen können im selben Decisions-Request gebündelt werden. Zusätzliche serielle Latenz und Informationsverlust durch die Zwischenrepräsentation sind Risiken dieser Architektur, keine gemessenen Ergebnisse. [S1, S5] |
| **Decisions routet Feldbereiche → Responses extrahiert Werte und Unklarheiten** | Sinnvoll als optionales Gate bei sehr vielen irrelevanten Turns oder großem Feldkatalog. Decisions kann mehrere Relevanzfragen prüfen; Responses bekommt anschließend Originaldialog und Routinghinweise. Hartes Vorfiltern kann relevante Felder verlieren. Zwei Calls auf positiven Turns; ein Gate-Call auf übersprungenen Turns. Ob dies Kosten/Latenz spart, hängt von Trefferquote, Tokens und Fehlerraten ab. Ableitung aus Routingfunktion und serieller Request-Latenz. [S1, S5] |
| **Responses extrahiert Kontextpakete → Responses bildet fachliches Ergebnis** | Beide Stufen können freie strukturierte Daten ausgeben; sinnvoll bei belegtem Wiederverwendungs-/Qualitätsbedarf oder unterschiedlichem benötigtem Kontext. Kein dokumentierter Zwang für LifeMap. Mehr Roundtrips gegen mögliche Qualitäts-/Modellvorteile evaluieren. [S2, S5] |

**Abwägung:** Zwischen den beiden vom Nutzer genannten Reihenfolgen ist „Decisions → Responses“ für Routing funktional klarer. „Responses → Decisions“ lohnt sich nur bei einer echten festen Klassifikationsentscheidung über bereits extrahierte Werte. Für das vollständige Zielobjekt ist in beiden Fällen Responses nötig. Eine Ein-Call-Baseline vermeidet zunächst diese Zusatzkomplexität. [S1, S2, S5]

## 4. Aktuelle Modelle, Latenz und belegbare Kosten

### Belegte Fakten

- Die aktuelle Model-Selection-Seite nennt **Luna · Low** ausdrücklich für „simple data extraction“ und zur Reduktion von Kosten/Latenz. Der Modellkatalog positioniert `gpt-6-luna` für fokussierte High-Volume-Aufgaben. Luna unterstützt Responses, Structured Outputs, Function Calling und Streaming; Reasoning-Aufwand `none` bis `max`, Standardwert `medium`. [S8, S9, S10]
- Der allgemeine Structured-Outputs-Guide empfiehlt für neue Projekte zunächst `gpt-6-astra`. Das ist eine allgemeinere Einstiegsempfehlung; für einfache, latenz-/kostensensitive Extraktion ist die aufgabenspezifische Luna/Low-Empfehlung relevanter. Bei widersprüchlicher, komplexer Evidenz nennt Model Selection stärkere Modelle/Settings, u. a. GPT-6.1 Sol. [S2, S8]
- Decisions behauptet im Guide „about 10x faster than the Responses API“. Dies ist eine Anbieterangabe für einen Endpoint mit anderem Ausgabeumfang, **kein LifeMap-Benchmark, keine Millisekunden-/p95-Garantie** und kein Nachweis, dass eine zweistufige Pipeline schneller wäre. [S1]
- OpenAI empfiehlt weniger Requests und kürzere Ausgaben zur Latenzoptimierung; zusammengehörige Schritte können in einer JSON-Antwort gebündelt werden. Der Guide enthält ältere GPT-3.5/GPT-4-Beispiele; diese sind keine aktuelle Modellwahlempfehlung. [S5]

### Preise laut abgerufener Dokumentation (USD pro 1 Mio. Tokens)

| Verwendung von `gpt-6-luna` | Input ungecacht | Cache-Read | Cache-Write | Output |
| --- | ---: | ---: | ---: | ---: |
| Responses, Standard-Texttarif | 0,10 | 0,01 | 0,125 | 0,50 |
| Decisions | 0,10 | Standard-Luna-Cachetarif | Standard-Luna-Cachetarif | nicht berechnet |

Quellen: Luna-Modellseite und Decisions-Guide. Regionalverarbeitung, Long Context und Verarbeitungstarife können die Preise verändern. Decisions-Caching benötigt mindestens 1.024 Tokens im wiederverwendbaren gemeinsamen Input-Präfix; Fragen zählen dafür nicht mit. Cachetreffer sind deshalb für kleine Turns nicht selbstverständlich. [S1, S9]

**Empfehlung:** Luna/Low als Evaluationsstartpunkt, optional `none` als separater Latenzvergleich – nicht als bereits belegter Qualitätssieger. Für Fehlerfälle stärkere Referenzmodelle vergleichen. Kostenvergleich anhand tatsächlicher Input-/Output-/Cache-Tokens pro Variante; keine pauschale „zwei Calls sind billiger“-Aussage. Allgemeine Modellwahl empfiehlt gleiche Eingaben und das leichteste Setting, das die Qualitätsgrenze erfüllt. [S8, S9]

## 5. Offene Punkte, Fehler und Unsicherheiten

- **Abrufbefund:** Kein 404 und kein Netzwerkfehler beim Nutzer-Guide. Einige lange Guides wurden vom Abrufwerkzeug gekürzt; die hier verwendeten Kernaussagen waren sichtbar, die Structured-Outputs-Fehlerfälle zusätzlich im gespeicherten Abruftext auffindbar. Öffentliche Dokumentation belegt Produktbeschreibung, nicht den tatsächlichen Zugriff des Pax-Projekts.
- **Nicht getestet:** SDK-Versionen, Projektberechtigungen, regionale Verfügbarkeit im konkreten Account, Rate Limits unter Last, reale Qualität, Latenz und Kosten. Keine authentifizierten oder kostenpflichtigen Aufrufe durchgeführt.
- **Fachlich offen:** Was zählt als Dialogpaket (KI-Frage + Personenantwort oder Person + folgende KI-Antwort)? Welches Latenzbudget gilt ab welchem Ereignis? Text, bestehendes Voice-System, GPT-Live oder Realtime? Welche Feldtypen, Mehrfachzuordnungen, Korrekturen und Unklarheitsarten müssen abgedeckt sein?
- **Vor Freigabe zu entscheiden:** Ob Unklarheiten nur das neue Paket oder den gesamten aktuellen Zustand repräsentieren; wie alte Unklarheiten aufgelöst werden; welche Nutzerbestätigung zur Übernahme nötig ist. Kein finales Schema, Prompt, Modellsetting oder Konfigurationsentwurf ist mit dieser Recherche freigegeben.
- **Spätere Evaluation empfohlen:** Deutsche Dialoge inkl. knapper Bestätigungen, Negation, Hypothesen, Zahlen/Datumsangaben, Korrekturen, Widersprüchen und Unterbrechungen; Feld-/Werttreffer, erfundene Nutzerfakten, Unklarheiten-Recall, Refusals/Abbrüche, p50/p95-Latenz und Tokenkosten getrennt messen. Grundlage: OpenAIs Empfehlungen zu repräsentativer Evaluation und Schwellenwertwahl. [S1, S4, S8]

## Quellen (offizielle OpenAI-Primärquellen; Abruf 31.10.2026)

- **[S1] Decisions:** https://developers.openai.com/api/docs/guides/decisions — Produktname, Endpoint, Typen, Grenzen, Mehrfachfragen, Preise, Caching und Geschwindigkeitsangabe.
- **[S2] Structured model outputs:** https://developers.openai.com/api/docs/guides/structured-outputs — eigene JSON-Schemata, Extraktion, Abgrenzung zu Tools/JSON Mode, Fehlerfälle.
- **[S3] Function calling:** https://developers.openai.com/api/docs/guides/function-calling — Toolzyklus, Argumente, Strict Mode.
- **[S4] Realtime transcription:** https://developers.openai.com/api/docs/guides/realtime-transcription — Modellempfehlung, Commit, Delta/Completed, Reihenfolge und Einschränkungen.
- **[S5] Latency optimization:** https://developers.openai.com/api/docs/guides/latency-optimization — weniger Requests, kürzere Ausgaben, Zusammenlegen von Schritten und Trade-offs.
- **[S6] Realtime conversations:** https://developers.openai.com/api/docs/guides/realtime-conversations — Konversation, Abschlussereignisse, Audio-/Text-Outputs und Statusprüfung.
- **[S7] Connect voice to Decisions:** https://developers.openai.com/api/docs/guides/decisions-voice — native GPT-Live-Delegation und Transkripttrigger.
- **[S8] Model selection:** https://developers.openai.com/api/docs/guides/model-selection — Luna/Low für einfache Extraktion und Evaluationshinweise.
- **[S9] GPT-6 Luna:** https://developers.openai.com/api/docs/models/gpt-6-luna.md — Fähigkeiten, Reasoning-Settings und Text-/Cachetarife.
- **[S10] Models:** https://developers.openai.com/api/docs/models — aktuelle Modellpositionierung.
