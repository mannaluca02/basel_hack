# Compliance und Regeln

Stand: 01.11.2026. Welche Regeln der Challenge und von Pax die Anwendung wo im Code durchsetzt. Rechtsrahmen der Challenge: [legal-framework.pdf](challenge_material/legal-framework.pdf).

## Nur erfundene Daten

Jeder Fall trägt `dataClassification: "synthetic"`; das Backend nimmt nichts anderes an. Policen sind ausdrücklich Demo-Policen („Demo – kein Versicherungsschutz“), Offerten nennen keine Prämie (`common.noPremium`), es entsteht kein Vertrag. Fälle laufen nach 24 Stunden ab, Sitzungen nach einer Stunde (`apps/api/src/insurance/engine.ts`, `auth.ts`).

## Drei getrennte Einwilligungen

| Hinweis | Wofür | Code |
|---|---|---|
| `lifemap-synthetic-v2` | Profil erfassen und an den Logismata-Rechner übertragen | `packages/contracts`, `POST /api/cases`, `/confirmations` |
| `voice-synthetic-v1` | Audio und Gespräch an den Sprachprovider (OpenAI) | `apps/api/src/voice/service.ts` |
| `extraction-synthetic-v1` | Auslesen der Angaben durch ein OpenAI-Modell | `apps/api/src/insurance/model-extraction.ts`, Tests `tests/model-extraction.test.mjs` |

Keine ersetzt eine andere. Die Extraktions-Einwilligung gilt für genau einen `noticeHash` (SHA-256 über Version, Empfänger, Umfang und alle vier Sprachtexte): Ändert sich der Hinweis, ist die alte Zustimmung wertlos (`blockedReason: notice_changed`). Der Weg ist standardmässig aus (`PAX_SYNTHETIC_EXTRACTION_ENABLED`); ist er aus, behauptet kein Hinweis eine KI-Übertragung. Vor jedem Modellaufruf und vor jedem Vorschlag prüft das Backend `modelExtraction.assertTransferAllowed` (`MODEL_EXTRACTION_DISABLED`, `MODEL_EXTRACTION_CONSENT_REQUIRED`, `HUMAN_HANDOVER_ACTIVE`). Das Modell sieht nur das Gespräch und die Feldbeschreibungen, nie den ganzen Fall, Revisionen oder Zugangsdaten. Routen: `GET /api/extraction/privacy`, `GET|POST /api/cases/:id/extraction/consent`, `POST …/consent/revoke`.

## Was Paxi im Gespräch darf

Festgelegt im Prompt (`apps/api/src/voice/prompt.ts`):

- keine echten Namen, vollständigen Geburtsdaten, Identifikations- oder Gesundheitsdaten verlangen;
- nur verwenden, was die Person sagt: keine erfundenen Beträge, keine geschätzte Risikobereitschaft, keine selbst gerechneten Renten- oder Steuergrenzen; unklare Periode, Währung oder brutto/netto nachfragen;
- Gehörtes ist ein unbestätigter Vorschlag; Paxi behauptet nie, etwas sei übernommen oder bestätigt;
- keine Übergabe: Paxi sagt nie, eine Kollegin oder ein Kollege schaue etwas an, und verspricht keinen Kontakt;
- ein ausdrücklicher Wunsch aufzuhören hat Vorrang.

Was Paxi hört, prüft das Backend gegen das gespeicherte Transkript (wörtliches Zitat, offenes Feld, passende Einheit), bevor es zum Vorschlag wird ([Live-Stimme](live-voice.md)).

## Bestätigung nur durch die Person

Vorschläge ändern den Entwurf erst, wenn die Person sie annimmt; das Gesamtprofil gilt erst nach ihrer ausdrücklichen Bestätigung, und erst dann wird gerechnet und empfohlen. Agenten (Stimme, Extraktion) dürfen nur vorschlagen. Gesprochene Bestätigungen sind an genau eine Frage, Aktion und Prüfstand gebunden und laufen nach zwei Minuten ab ([Bestätigungen und Unklarheiten](baselhack/plans/voice-confirmation-and-dialogue.md)). Die Live-Konfiguration übernimmt Vorschläge automatisch; das ist eine bewusste Vereinfachung der Demo.

## Persönliche Beratung

Der Schalter `handover` stoppt jede digitale Verarbeitung des Falls (Stimme, Extraktion, laufende Berechnungen) und gibt ihn an eine Beratungsperson ([Übergabe](baselhack/plans/human-advisor-handover.md)). Paxi bietet ihn im Gespräch nicht an; die Person erreicht ihn über die App.

## Angemessenheitsprüfung (Vorprüfung)

Pax muss vor der Empfehlung einer qualifizierten Lebensversicherung die Angemessenheit prüfen. Qualifiziert sind Produkte mit Verlustrisiko im Sparprozess und Kapitalisationsgeschäfte. Im Katalog sind das **FondsStar, LifeStar und Auszahlungsplan** (`QUALIFIED_PRODUCT_IDS`).

Die digitale Vorprüfung bildet das Pax-Formular **0054/PMPV/03.2026** ab:

| Teil | Inhalt | Wirkung |
|---|---|---|
| A | Gewünschte jährliche Sparprämie und/oder Einmalinvestition; eigenes Nettoeinkommen, Nettovermögen, jährlicher Spielraum (A3), Einmalbetrag (A4); nur eigene Werte, ohne Partner | Tragbar, wenn Prämie ≤ Obergrenze A3 und Einmalinvestition ≤ Obergrenze A4 |
| B | Anlageziel (0/15/30 Punkte), Laufzeit 10–15 Jahre (15) oder über 15 Jahre (30) | Punkte |
| C | Wertschriftenkenntnisse (0/10/20/30), Reaktion auf 30 % Kursverlust (0/10/20/30) | Punkte |
| D | Garantierter Teil in % | Punkte × (100 % − Garantie) + 120 × Garantie |
| Ergebnis | Konservativ bis 44, ausgewogen 45–84, dynamisch ab 85 Punkten | Angemessen nur, wenn tragbar **und** die gewählte Strategie der ermittelten entspricht |

Eine Laufzeit unter zehn Jahren sieht das Formular nicht vor. Die Vorprüfung rät dann ab (`HORIZON_TOO_SHORT`); das ist unsere Auslegung und mit Pax zu bestätigen.

Routen:
- `GET /api/cases/:id/suitability` – Formularversion, qualifizierte Produkte und die bisherigen Prüfungen des Kunden (nicht für Agent-Grants; nie im Fall-DTO).
- `POST /api/cases/:id/suitability` – Kunde beantwortet die Prüfung für ein Produkt und eine Person des bestätigten Profils (`answersConfirmedByCustomer: true`).

Sperre: `POST /demo-quotes` mit einem qualifizierten Produkt verlangt für dieses Produkt und diese Person eine Prüfung zur aktuellen Profilversion. Fehlt sie: `SUITABILITY_CHECK_REQUIRED`. Rät sie ab: `SUITABILITY_ADVISED_AGAINST` mit den Gründen in `fields`; dann bespricht eine Pax-Beratungsperson die Möglichkeiten. Empfehlungen für diese Produkte tragen den Grund `SUITABILITY_CHECK_REQUIRED`. Im Frontend setzt nur eine passende Prüfung `productGate.suitabilityCheckDone`.

Grenzen: Jede Prüfung ist `binding: false` und `humanConfirmationRequired: true`. Das Formular darf laut Pax nur unverändert verwendet werden; ob ein digitales Äquivalent zulässig ist, klären wir mit Pax. Unterschrift und verbindliche Prüfung bleiben bei der Pax-Beratungsperson. Die Texte des Formulars liegen nur auf Deutsch vor.

## Identifikation, Geldwäscherei, Gesundheitsfragen, Unterschrift

Das Legal-Framework der Challenge nennt Informationspflichten, Formvorschriften und Geldwäschereiprüfung. Die Demo führt diese Schritte nicht aus, verschweigt sie aber auch nicht. `GET /api/cases/:id/portal` und das Dossier enthalten immer `complianceSteps` mit `identification`, `aml_check`, `health_declaration` und `signature`. Jeder Schritt hat den Status `required_in_real_integration` sowie Bezeichnung und Erklärung in DE/FR/IT/EN. Die Oberfläche zeigt sie im Abschlussweg als „bei einem echten Abschluss nötig“.

Offene Fragen an Pax: zulässige digitale Form der Angemessenheitsprüfung, Ablauf von Identifikation und GwG-Abklärung, Gesundheitsprozess je Produkt.
