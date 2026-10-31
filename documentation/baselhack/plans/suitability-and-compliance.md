# Angemessenheitsprüfung und Compliance-Schritte im Demo-Abschluss

Stand: 31.10.2026. Backend: `code/apps/api/src/insurance/suitability.ts`, Verträge: `code/packages/contracts/src/suitability.ts`, Tests: `code/tests/suitability.test.mjs`.

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
