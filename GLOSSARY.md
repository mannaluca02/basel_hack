# Pax Digital Advisor

A self-service AI pension advisor for Pax customers in Switzerland that builds a holistic picture of a customer's life and three-pillar provision, accompanies them over time, and only then positions fitting Pax products. Canonical terms are the German Pax terms; English glosses are given for orientation.

## Pension system

**Säule 1** (1st pillar):
State provision (AHV/IV): old-age, survivors' and disability pensions.
_Avoid_: state pension (as a canonical term)

**Säule 2** (2nd pillar):
Occupational provision via the employer's pension fund (BVG/Pensionskasse) plus accident insurance (UVG).
_Avoid_: PK, company pension

**Säule 3a** (pillar 3a, "gebundene Vorsorge"):
Tax-privileged, restricted private provision with a yearly contribution cap.
_Avoid_: 3a account, tied pension

**Säule 3b** (pillar 3b, "freie Vorsorge"):
Unrestricted private provision without 3a tax privileges or caps.
_Avoid_: free savings

## Analysis

**Vorsorgefall** (insured event):
One of the three situations the analysis covers: Erwerbsunfähigkeit, Tod, Erleben.
_Avoid_: risk, scenario

**Erwerbsunfähigkeit** (disability / incapacity to work):
Vorsorgefall in which the customer can no longer earn income, distinguished by cause (Krankheit or Unfall) and duration (kurzfristig, langfristig).
_Avoid_: invalidity, EU (spelled out in user-facing text)

**Tod** (death):
Vorsorgefall in which the customer dies and surviving dependants need income.
_Avoid_: survivors' case

**Erleben** (reaching retirement):
Vorsorgefall in which the customer reaches retirement age and lives on pension income.
_Avoid_: retirement scenario, Pension

**Vorsorgebedarf** (provision need):
The income the customer (or their dependants) needs in a Vorsorgefall, expressed as an annual amount.
_Avoid_: target income, need

**Vorsorgelücke** (provision gap):
The shortfall between Vorsorgebedarf and the benefits from all three pillars in a Vorsorgefall; a negative gap is a surplus.
_Avoid_: gap, shortfall, coverage gap

**Vorsorgebild** (pension picture):
The customer's living overview of Vorsorgebedarf, three-pillar benefits and Vorsorgelücke per Vorsorgefall, built up during the conversation.
_Avoid_: dashboard, overview, pension check

**Lebenssimulation** (life simulation):
A what-if projection of the Vorsorgebild under one or more hypothetical Lebensereignisse.
_Avoid_: scenario, forecast

## People

**Kunde** (customer):
A private person (or couple/family) receiving advice; anonymous until an Antrag.
_Avoid_: user, client, lead

**Demo-Kunde** (demo customer):
A fictional Kunde used to demonstrate the advisor, e.g. the Pax personas Müller, Smith and Johnson.
_Avoid_: persona (ambiguous)

**Beratercharakter** (advisor character):
One of several AI advisor identities (name, look, voice, tone), always clearly labelled as AI, matched to a Kunde to increase acceptance.
_Avoid_: persona, avatar, bot

## Customer journey

**Einwilligung** (consent):
The customer's explicit, granular permission for a specific data use (storing pension data, voice processing, Wiederkontakt), given before that use starts and revocable at any time.
_Avoid_: terms acceptance, opt-in (as a noun)

**Lebensereignis** (life event):
A change in the customer's life that may alter their Vorsorgebedarf, e.g. moving in together, a child, buying a home, a job change.
_Avoid_: trigger, life change

**Adressänderung** (change of address):
A detected change of the customer's address, treated as a signal that a Lebensereignis may have happened.
_Avoid_: relocation, move

**Wiederkontakt** (re-contact):
The advisor proactively reaching out to an existing customer after a Lebensereignis signal to review and adapt their provision.
_Avoid_: follow-up, reminder, campaign

**Altersmeilenstein** (age waypoint):
A predefined age (e.g. 30, 35, 45) at which the advisor initiates a Wiederkontakt regardless of other signals.
_Avoid_: annual review, check-up

**Beraterübergabe** (handover to a human advisor):
Transfer of a case from the AI advisor to a human Pax advisor based on predefined criteria or customer request.
_Avoid_: escalation, fallback

**Übergabekriterium** (handover criterion):
A predefined, documented rule that, when met, requires a Beraterübergabe instead of an automated decision.
_Avoid_: escalation rule, red flag

## Pax products (private provision)

**Pax Care**:
Free digital entry product providing immediate financial and organisational help to dependants on death.

**Pax 3a**:
Fully digital Säule 3a solution combining guaranteed and fund-linked saving, with premium waiver on Erwerbsunfähigkeit.

**Pax Todesfallversicherung**:
Risk insurance paying a guaranteed lump sum on Tod.
_Avoid_: life insurance (too broad)

**Pax Erwerbsunfähigkeitsversicherung**:
Risk insurance paying an annual income on Erwerbsunfähigkeit after a waiting period.
_Avoid_: disability insurance, EU-Rente

**Pax LifeStar**:
Savings life insurance (Säule 3a or 3b) with a variable split between a guaranteed part and a fund part.

**Pax FondsStar**:
Fund-linked savings life insurance (Säule 3a or 3b) with family-oriented features such as premium relief on Familienzuwachs.

**Pax Kinderversicherung**:
Savings and risk insurance taken out for a child by parents, godparents or grandparents.

**Pax Auszahlungsplan**:
Säule 3b product that pays out invested capital in scheduled stages, typically after retirement.

**Baustein** (building block):
A single benefit or feature that Pax products are assembled from, e.g. Todesfallkapital, Erwerbsunfähigkeitsrente, Prämienbefreiung, Sparteil.
_Avoid_: module, rider, feature

**Ausbaugarantie** (top-up guarantee):
The right to increase an Erwerbsunfähigkeitsrente without a new health check after defined Lebensereignisse (marriage, divorce, home purchase, salary increase, end of child pension).
_Avoid_: upgrade option

**Prämienbefreiung** (premium waiver):
A Baustein under which Pax pays the customer's premiums during Erwerbsunfähigkeit (or for a period after a birth), so the savings goal is still reached.
_Avoid_: premium holiday

**Vorsorgelösung** (provision solution):
Collective term for any Pax product positioned as the answer to a Vorsorgelücke or goal.
_Avoid_: product (in customer-facing language)

## Recommendation and oversight

**Empfehlung** (recommendation):
A Vorsorgelösung proposed for a specific Vorsorgelücke or goal, always accompanied by its Empfehlungsbegründung.
_Avoid_: suggestion, offer

**Empfehlungsbegründung** (recommendation rationale):
The traceable chain from customer data via calculated Vorsorgelücke and applied rule to an Empfehlung, understandable for the customer and auditors.
_Avoid_: explanation, reasoning log

**Pax-Cockpit** (internal Pax view):
The internal workspace where human advisors pick up Beraterübergaben, auditors inspect Empfehlungsbegründungen, and Product Management sees drop-offs and NPS.
_Avoid_: admin panel, backoffice, CRM

## Products and contracting

**Angemessenheitsprüfung** (suitability assessment):
The legally required check of financial capacity, investment goal, horizon, knowledge and risk tolerance before recommending a Qualifizierte Lebensversicherung.
_Avoid_: risk profile questionnaire, suitability check

**Qualifizierte Lebensversicherung** (qualified life insurance):
A life insurance in which the customer bears investment loss risk during saving (fund-linked products, capitalisation products).
_Avoid_: investment product

**Offerte** (quote):
A concrete, non-binding Pax product proposal with premiums and benefits for a specific customer.
_Avoid_: proposal, Vorschlag

**Antrag** (application):
The customer's binding request to conclude a contract based on an Offerte; revocable within 14 days.
_Avoid_: order, signup

**Police** (policy):
The concluded insurance contract as it appears in the Kundenportal.
_Avoid_: contract, Vertrag

**Kundenportal** (customer portal, "myPax"):
The customer's personal space holding their Policen, their pension picture, the documented reasoning behind each recommendation, and incoming Wiederkontakte.
_Avoid_: dashboard, account
