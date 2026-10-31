# Logik-Backend – implementierter Lebensversicherungs-PoC

Stand: 31.10.2026 · Valentin · Modell `lifemap-life-insurance-0.2.0` · Feature `feature/life-insurance-live-backend`.

Der ausdrücklich bestätigte Backend-Umfang LOG-01–LOG-07 ist implementiert und automatisch geprüft. Der [Start-/Integrationsleitfaden](../../../code/README.md), die [Requirements-Matrix](life-insurance-requirements.md) und der [Live-Nachweis](life-insurance-live-verification.json) bilden die Übergabe. Der frühere reine Fixture-Demonstrator bleibt separat verfügbar; `npm start` startet jetzt die geschützte Live-Rechner-Anwendung.

## Verhalten

Ein Kunde eröffnet eine anonyme synthetische Sitzung, sieht den Datenschutzhinweis und erfasst Ziele, Familie/Partnerschaft, Einkommen/Ausgaben, alle drei Vorsorgesäulen, Schulden, Kinder, bestehende Risikoabsicherung und eigenen finanziellen Spielraum. Ein Entwurf wird erst nach Pflichtfragen und ausdrücklicher Bestätigung zu einem unveränderlichen Profil. Fehlende Werte bleiben unbekannt.

Der Server ruft echte Logismata-Rechner auf und normalisiert nur an der API-Grenze von CHF in ganze CHF-Rappen. Lokale Budget-/Kapitalregeln, ereignisspezifische EU-/Todesfallbedarfe und die endliche Kapitalisierung ergänzen die Providerdaten. Vorhandene private Risiko-Renten, bereits im Provider berücksichtigter Partnerlohn, bestehendes Todesfallkapital und bestätigte freie-Mittel-Strategie werden nachvollziehbar behandelt. Sparvorschläge berücksichtigen bereits laufende Beiträge, die gelieferte 3a-Grenze und persönliche sowie Haushaltsmittel.

Familien-, Eigenheim- und Pensionierungsvarianten bleiben separate Läufe desselben Profils. Die Pensionierungsprojektion trennt Erwerbsende, Überbrückung und Rentenbeginn je Person; gebundenes Kapital und gebundene zusätzliche Sparbeträge werden erst zum ausdrücklich angenommenen Zeitpunkt verfügbar. Kapitalerschöpfung bleibt sichtbar. Variantenvergleiche sind gespeichert und an beide Eingabehashes gebunden. Veraltete Rückläufe ersetzen nie einen neueren Profil-/Szenariostand.

Erst danach entstehen regelbasierte Pax-Produktfamilien mit Gründen und Quellen. Eine Empfehlung ist keine echte Offerte. Der aktuelle Lauf und eine getrennte Reviewer-Freigabe sind Vorbedingungen für die vom Kunden gewählte Demo-Konfiguration. Dokumentbestätigung, Antrag, Einreichung, Prüfung, Demo-Annahme und Demo-Police sind getrennte gespeicherte Zustände. Identische Befehle erzeugen keine doppelten Anträge/Policen. Das Portal lädt sie nach Neustart wieder. Die zwei Summary-Sichten verwenden dieselbe bestätigte Datenbasis und Snapshot-ID.

## Architektur und Schutz

- Geteilte Zod-Verträge für Aufnahme, Profil, Szenario, GraphContext und vollständige Analyseausgabe; reine Fachfunktionen in `packages/domain`.
- NestJS-HTTP-API und OpenAPI 3.1 unter `/api/openapi.json`, auflösbare Komponentenreferenzen und gemeinsame TypeScript-Verträge für Angular/Earnie.
- Ein zentraler JSON-Fall mit Entwurf, unveränderlichen Bestätigungen, ursprünglichen Läufen, Review-Aufgaben, Empfehlung/Vertrag/Portal, Vorschlägen, Vergleichen und Ereignissen. Explizite Fallrevision schützt konkurrierende Schreibzugriffe.
- Lokaler AES-256-GCM-Speicher mit zufälligem Nonce, Integritätsprüfung, atomarem Austausch, privaten Dateirechten, Größen-/Objektgrenzen und Prozesssperre. Ein Node-Prozess; keine produktive Mehrinstanz-Datenbankmigration behauptet.
- Rollen aus serverseitig erzeugten getrennten Codes; Besitzerbindung, gehashte Sitzungstoken, Ablauf, Login-/Schreibgrenzen, HttpOnly-/SameSite-Cookies und CSRF bei Cookie-Schreibzugriffen. Loopback-Bindung und begrenzte Angular-Origins.
- Fallgebundener 15-Minuten-Agentzugang zu minimalem Kontext, SSE und erlaubten Vorschlägen. Kundenbestätigung bleibt zwingend; ein Transkript bestätigt weder Betrag noch Profil. Widerruf beendet offene SSE-Streams; Kunden-Logout widerruft auch die zugehörigen Agentzugänge.
- Öffentlicher Hinweis vor Datenaufnahme; ausschließlich synthetische Daten, keine Gesundheitsrohdaten, keine externen Modellaufrufe. Audit speichert IDs/Aktionen statt vollständiger Finanzprofile. Fallablauf nach 24 Stunden, regelmäßige Bereinigung und explizite Besitzerlöschung einschließlich Feedback/Agentzugängen.
- Optionale NPS-Aufnahme und Reviewer-Aggregate ohne Freitext oder Finanzbeträge. Inaktivität wird als Signal beschrieben, nicht als belegter Abbruch.

Das sind geprüfte PoC-Schutzmaßnahmen. Rechtskonformität im Produktivbetrieb, echte Kundenidentität, TLS/KMS, Aufbewahrungsrecht und behördliche/vertragliche Pflichten erfordern Pax-Freigabe.

## Rechen-APIs und tatsächliche Prüfung

24 Operationen sind mit strikten Requests und normalisierten Antworten implementiert und live ausgeführt: `saving3aLimits`, `ageLimits`, `riskBase`, `risk`, `retirementBase`, `retirement`, `income`, `budgetProposal`, `saving`, `consumption`, `searchLocation`, `location`, `incomeFortuneTax`, `saving3a`, `capitalTax`, `purchaseP2`, `taxBaseInfo`, `searchLocationGeo`, `estateGainFields`, `estateGainTax`, `inheritanceAll`, `inheritanceGroup`, `inheritanceBeneficiary`, `corporateEntityTax`.

Der Live-Client verwendet einen festen Host/Pfad, keine Redirects, maximal zwei parallele Requests, begrenzte Queue, fünf Sekunden Timeout je Versuch und höchstens einen Retry bei vorübergehenden Fehlern. Authentisierungsfehler werden nicht wiederholt, Payloads/Tokens nicht in Fehlermeldungen gespiegelt. Es gibt keinen stillen Replay-Fallback. Der Replay-Provider benötigt einen exakt identischen vollständigen Request-Hash.

**Automatische Suite:** 111 Tests, 0 Fehler. Sie umfasst die bisherigen Fach-/Adaptertests und neue Lebensversicherungs-, Persistenz-, Review-, Vertrags-, Rollen-, HTTP-, CSRF-, Dokument-, SSE-, OpenAPI-, Vergleichs- und NPS-Negativfälle. Provider in normalen Tests sind synthetisch injiziert; reale Requests sind dem ausdrücklichen Live-Test vorbehalten.

**Echter Live-Durchstich:** 24 Operationen erfolgreich; Baseline, Familie, Eigenheim, Pensionierung ohne Providerfehler, drei Vergleiche. Empfehlung, separate Test-Reviewer-Rolle, Demo-Konfiguration mit archivierten Dokumentnachweisen, Antrag, idempotente Einreichung, Demo-Annahme, Demo-Police, identische Summary-Snapshots und Portal nach Server-Neustart durchlaufen. Alle verwendeten Angaben waren erfunden. Temporäre Testdaten wurden anschließend gelöscht. Zugangsdaten wurden weder kopiert noch ausgegeben.

Die Risikoantworten mit Code `0` bleiben `requires_review`; die Testrolle legitimiert keine fachlich ungeklärte Providersemantik. Keine Gleichsetzung mit vlot-/Studienfallwerten ohne identische Annahmen. Geburtsmonat, PK-Folgen, Kapitalfreigabe, Steuern, Begünstigung und Produkttauglichkeit bleiben ausdrücklich fachlich prüfpflichtig.

## Team-Übergabe und echte Abschlussgrenzen

Luca bindet die geschützte API über Angular-Proxy an. Earnie verwendet denselben Fallservice und liest vor jeder Antwort `/advisor/context`. Dario/Earnie reagieren auf `/advisor/events`, prüfen Kontext-/Run-/Profilreferenzen und unterbrechen veraltete Antwort-/Audiostände. Lukas erhält den getrennten Datenaufnahme-Fortschritt für den vereinbarten Ring. Die Benutzeroberfläche, LLM-Antwort, STT/TTS und Avatar-Animation sind nicht Bestandteil dieser Implementierung.

Es wurden keine echten Pax-Tarifierungs-, Underwriting-, Identitäts-/AML-, Signatur-, Annahme- oder Policierungs-APIs bereitgestellt. Deshalb bleiben alle Konfigurationen und Policen explizite lokale Demo-Objekte. `premiumCents:null`, `premiumStatus:pax_tariff_api_unavailable`, `coverageInForce:false` und `legalEffect:none` verhindern eine irreführende Deckungsbehauptung. Ein echter Abschluss bleibt gesperrt. Die [Requirements-Matrix](life-insurance-requirements.md) führt alle Release-Gates und gemeinsame Abnahmen auf.

## Quellen und bestehender Archivzustand

Die Produktfamilien sind anhand der offiziellen [Pax-Produktübersicht](https://www.pax.ch/de/private-vorsorge) und der vorhandenen archivierten Broschüren/Bedingungen nachvollziehbar hinterlegt. Dokumente tragen SHA-256 und Archivstand, jedoch keine unbelegte Aktualitätsfreigabe. Aktuelle fachliche Eignung und konkrete Tarife sind mit Pax zu bestätigen. Für die Transparenzanforderungen ist die [EDÖB-Information zur Informationspflicht](https://www.edoeb.admin.ch/de/informationspflicht) eine relevante Primärquelle; der Demo-Hinweis ersetzt keine rechtliche Freigabe.

Der bestehende vollständige Quellenkatalog-Build scheitert weiterhin an den im Commit `6bf72c6` bewusst entfernten 16 Videodateien. Diese Änderung wird respektiert; Videos werden nicht wiederhergestellt. Quellen-/Medieninventare bleiben historisch. Die vorliegende Implementierung und ihre Tests benötigen die vorhandenen API-Spezifikationen/-Beispiele und Produkt-PDFs, keine Videodateien. Neue Dokumentlinks werden separat geprüft.


## Nachtrag: 24 Operationen und DE/FR/IT/EN

Die acht zuvor ausgelassenen Sponsor-Operationen sind als geschützte isolierte Zusatzrechner ergänzt. Sie verwenden validierte Anfragen, klare Rappen-/CHF-Grenzen und getrennte Begünstigtenalternativen. Keine dieser Abfragen mutiert automatisch Profil, Lebensversicherungsbedarf oder aktiven Lauf.

Die vorher nur teilweise vorhandene Mehrsprachigkeit wurde vervollständigt: 191 lokale Texte für DE/FR/IT/EN, öffentliche Katalog-/Datenschutzprojektion, übersetzte Rückfragen, Empfehlungen, Bedingungen/Alternativen, Status-/Grafik-/Fortschrittsbeschriftungen, Fehlermeldungen und beide lesbaren Dossier-Exporte. Sprachwechsel verändert technische Kontextrevisionen, aber keine finanzielle Version und keinen bestehenden Rechenhash. Die normale Budget-Abfrage verwendet jetzt die passende Sprache statt fest Deutsch.

Die vollständige Suite umfasst 111 erfolgreiche Tests. Der echte Durchstich führt alle 24 Operationen und vier Sprach-/Exportprüfungen mit erfundenen Daten aus. Sprachprüfungen bleiben Backend-/API-Prüfungen; die Darstellung und Audioausgabe durch die anderen vier Teammitglieder sowie rechtsgültige Originaldokumente in passenden Sprachen werden gesondert integriert und abgenommen.
