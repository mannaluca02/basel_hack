# Team brief: Pax Digital Advisor (BaselHack 2026)

Status after the first design session, 2026-10-30. Vocabulary: see [GLOSSARY.md](../GLOSSARY.md). Decisions: [docs/adr/](adr/). Research: [docs/research/](research/).

## The challenge in one paragraph

Build a working prototype of an AI pension advisor for Pax that customers use themselves. It puts the customer's whole life situation first, links pillars 1, 2 and 3, simulates life events, and only then recommends Pax products with reasons. It must go all the way through: **advisory → recommendation → contract → policy in the customer portal**, and hand over to a human when needed.

**Disqualifiers:** pushing products first, ignoring a pillar, a prototype that doesn't work, breaching data protection (DSG).

**Legal requirements:** transparent data use; recommendations explainable and auditable; human review based on criteria set in advance; security and insurance-law compliance.

**Bonus points:** DE/FR/IT/EN, voice, avatar, future-life simulation, NPS, drop-off insights for Product Management.

**Team and time:** 5 people, about 32 hours, building mostly with AI tools.

## What we decided

| # | Topic | Decision |
|---|---|---|
| 1 | Core idea | A lifelike advisor in a **call-style UI**. The advisor sits in a small corner card, and the main screen is a workspace where the **Vorsorgebild** (pension picture) builds up live as the customer talks. Live recalculation moments are the key wow. |
| 2 | Device | **Mobile-first.** |
| 3 | Interaction | **Voice first.** At the start the advisor asks whether the customer prefers voice or text. Simple answers by **buttons**, typing always possible. |
| 4 | Calculations | **Fixed logic calculates, the AI reasons.** Every figure comes from the Logismata API or our own rules. The AI compares options and explains, but never invents a number. ([ADR 0001](adr/0001-deterministic-calculations-ai-reasons.md)) |
| 5 | Target group | **People in their 20s**, with a lifelong relationship. |
| 6 | Demo story | **One life told over time:** our own persona aged 26 (first conversation: Pax Care, Pax 3a, disability cover) → **Adressänderung** triggers a Wiederkontakt (moved in with partner) → baby (the Müller situation) → later Smith-like stage with a human hand-over. |
| 7 | Wiederkontakt | Triggers: **Adressänderung** plus **Altersmeilensteine** (e.g. 30/35/45, to be defined). No yearly check-up. Push notification opens the call. Demo uses a "time travel" control. Optional: hand over to a human if the customer doesn't respond. |
| 8 | Language | **German Pax terms** as the official vocabulary, app in German first. FR/IT/EN once the main flow works. |
| 9 | Products | **All 8 private Pax products:** Pax Care, Pax 3a, Todesfallversicherung, Erwerbsunfähigkeitsversicherung, LifeStar, FondsStar, Kinderversicherung, Auszahlungsplan. Linked to Vorsorgelücken and life stages by fixed rules. |
| 10 | Contract → Policy | **Fully simulated:** Offerte with reasons → Angemessenheitsprüfung (fund-linked only) → Antrag (health questions, mocked identity check and signature, 14-day cancellation notice) → **myPax Kundenportal** with the Police. Wiederkontakte arrive there too. |
| 11 | Human hand-over | Starting list of **Übergabekriterien**, not fixed yet. Health questions are partly automated (some conditions only humans decide). Self-employed or no pension fund is handled by the advisor, not handed over. Others: customer asks, high assets or single premium, suitability check fails, divorce or abroad, high total premium. |
| 12 | Simulations | Moving in or marrying, child, buying a home, reducing hours, early retirement, what-if disability or death. **Build first: child, home, early retirement.** Controlled by voice or by dragging events onto a timeline. |
| 13 | Internal view | Thin **Pax-Cockpit:** handed-over cases (for the advisor), audit trail (for each recommendation), funnel and NPS (for Product Management). |
| 14 | Entry and consent | **Anonymous until the Antrag.** Granular consent card first (save data / voice / Wiederkontakt). Account created at the Offerte or Antrag. |
| 15 | Advisor identity | **Several Beratercharaktere** to increase acceptance, always labelled as AI. |

## What the existing Pax tool does (our benchmark)

pax.ch's "Vorsorgeanalyse" is built by an outside company (vlot). It's an **8-step form** with a QR scan of the pension-fund certificate, a score out of 1,000, monthly gaps per risk and a 3a tax hint. It ends in a **PDF download**: no Pax product names, no contract, no portal, no follow-up. Details: [research/pax-vorsorgeanalyse-flow.md](research/pax-vorsorgeanalyse-flow.md).

We go beyond it on: conversation instead of forms, live simulations, named products with reasons, contract through to Police, and a lifelong Wiederkontakt.

## Open questions

### For the team
1. **Beratercharakter selection:** customer picks, automatic match, or suggested from the advice style they choose (recommended)? How many do we build (recommended: 2)?
2. **Avatar visual:** a profile picture that glows while speaking (reliable), an illustrated avatar (bonus) or a realistic video avatar (not recommended)? Needs quick prototypes.
3. **AI and voice models:** compare options via OpenRouter on delay, German/Swiss German quality, reliable calculation calls, and **where data is hosted**. Separate speech steps with a privacy filter, or one speech-to-speech model?
4. **Tech stack:** not decided (an earlier suggestion was a Next.js mobile web app).
5. **Our own demo persona:** name, job, income, city, and the exact life stages and years in the demo.
6. **Pitch:** format and length, who presents, live demo vs. recording backup, and how judges can try it themselves (QR code?).
7. **Work split** across 5 people and milestones within the 32 h.
8. **Altersmeilensteine:** which ages exactly?

### For the Pax experts (Cem and Claude, Friday)
1. Are **people in their 20s** a target group Pax cares about? (Their personas and sample quotes skew older.)
2. Is the **Adressänderung signal** realistic? What does Pax actually learn about address changes?
3. **Übergabekriterien:** which limits (assets, premium) and which health conditions require a human?
4. **Vorsorgebedarf rules:** is 80% of income for disability and retirement and 70% for survivors the house standard? Other assumptions?
5. **Product rules:** which product for which gap and age? Minimum premiums, entry ages, underwriting limits for Pax 3a, Pax Care and Kinderversicherung?
6. Can we use the **vlot analysis data model** or the QR scan of the pension-fund certificate as inspiration, or is there an API?
7. Which **AI or cloud setup** would Pax accept for personal data (Swiss/EU hosting, providers)?
8. What does the real **myPax portal** show today, and what would they want in it?

## Available resources

- `material/`: personas, legal framework, Vorsorgecheck examples (single and couple), Angemessenheitsprüfung, 5 sample quotes; `material/api/APICalc-swagger.yaml`
- **Logismata API** (tested, works): `https://baselhackathon2026.azurewebsites.net/viper`, bearer token on the hackathon hub's tools page. Key operations: `calculateRisk`, `calculateRetirement`, `calculateSaving3a`, `calculatePurchaseP2`, tax calculations, `searchLocation`
- Hackathon hub: https://pax-hackathon-2026.vercel.app (password `hack2026`)
- Quicksale demo (reference for the contract flow): https://portal.pax.ch/quicksale/edu/
- Design: https://ui.pax.ch (Angular Storybook, probably not installable as a package), https://brand.pax.ch. Colours: purple `#3c0078`, green `#8ccd0f`; font: Pax Civil.
