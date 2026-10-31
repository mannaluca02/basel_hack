# Existing Pax Vorsorgeanalyse flow (walkthrough 2026-10-30)

Source: https://www.pax.ch/de/private-vorsorge/vorsorgeanalyse/embedded, an iframe of `check.pax.vlot.ch` (built by the third-party vendor **vlot**, analytics in Azure Switzerland North). Walked through on mobile viewport with demo data "Lena".

## Demo input used

| Field | Value |
|---|---|
| Lebenssituation | Einzelperson |
| Vorname / Geburt | Lena, März 2000 |
| PLZ | 4051 Basel |
| Ausbildung | Bachelor |
| Geschlecht / Raucher | weiblich / nein |
| Erwerb | Angestellte, Informatikerin, CHF 75'000 brutto, erstes Arbeitsjahr CH 2022 |
| Pensionskasse | Vorsorgeausweis nicht verfügbar → CH-Durchschnittswerte |
| Ersparnisse | Sparkonto (3b) CHF 15'000, CHF 3'000/Jahr |
| Lebensversicherungen | keine |
| Wohnen | Mieterin, CHF 1'600/Monat |

## Steps and data collected (in order)

1. **Start**: "Analyse starten" = implicit acceptance of AGB + privacy notice (no granular consent).
2. **Aktuelle Lebenssituation**: Einzelperson / Partnerschaft / Einzelperson mit Kindern / Partnerschaft mit Kindern.
3. **Persönliche Daten**: Vorname, Geburtsmonat + -jahr (no day), PLZ (autocomplete to town), höchste Ausbildung, Geschlecht, Raucher (last 3 years).
4. **Erwerb**: Anstellungsstatus (Angestellt / Selbständig / Student / Hausfrau·mann / Arbeitslos), Beruf (autocomplete job catalogue, drives risk class), Bruttoeinkommen/Jahr, erstes Arbeitsjahr in CH (for AHV gaps).
5. **Pensionskasse**: Vorsorgeausweis available?
   - Yes → **QR-code scan** of the certificate or manual: Invalidenrente, IV-Kinderrente, Witwen-/Witwerrente, Waisenrente, Todesfallkapital, Altersrente + projiziertes Alterskapital at 65; multiple plans possible.
   - No → choose **CH-Durchschnittswerte** or **BVG-Minimalleistungen** (with accuracy warning).
6. **Bankkonten und Vermögen**: savings for retirement yes/no/unknown → items of type 3a / Sparen (3b) / Freizügigkeit / sonstige Vermögenswerte, each with name, yearly savings, total; QR scan also offered.
7. **Lebensversicherungen**: existing policies yes/no/unknown → yearly premium, insurer (list incl. Pax), start/end year, flags 3a / Invalidität / Todesfall / Sparen.
8. **Wohnsituation**: Mieter (monthly rent incl. Nebenkosten) or Eigentümer (value, house/flat, location, mortgage yes/no).
9. **Calculation** (animated "analysing / calculating / finalising").

For couples/families the same person blocks repeat per partner, plus children.

## Result for Lena

- **Score 398 / 1000** (gauge with sad face) as a single "financial wellbeing" indicator.
- **Prioritised gaps**:
  1. Invalidität: **CHF 2'520 / month** gap
  2. Pensionierung: **CHF 408 / month** gap (target CHF 5'000; AHV 2'433 reduced by missing years, incl. 13th AHV pension; PK 1'399; Kapitalverzehr 760 → 4'592)
  3. Steuern: 3a currently CHF 0, potential CHF 7'258 → **save up to CHF 1'748 / year**
- Tabs: Übersicht · Familienvorsorge · Pensionierung · Steuern · Lösung. Target income is editable.
- **Lösung**: generic needs, no product names:
  - Sparlösung Pensionierung: Sparziel CHF 102'000, CHF 163 / month
  - Risikoabsicherung Invalidität: CHF 31'000 yearly cover, CHF 90 / month premium
- **End**: confirm "analysis is final, no more changes" → redirect to download PDF. No contract, no account, no portal, no follow-up.

## Takeaways for our advisor

- The data model is a good checklist of required inputs: household type, birth month/year, PLZ, job + status, gross income, first working year in CH, smoker, PK certificate values (or averages), savings by pillar, existing policies, housing cost.
- Ideas worth reusing: QR scan of the PK certificate, choosing "averages vs. BVG minimum" when data is missing, monthly framing of gaps, prioritised gap list, tax-saving hook via 3a.
- Gaps we can fill: fixed form instead of conversation; consent is all-or-nothing; no life-event simulation; solutions stay generic (no Pax product, no explanation of why); the flow dead-ends in a PDF with no Offerte, Antrag, Police or Wiederkontakt; and it can't be changed after finishing.
