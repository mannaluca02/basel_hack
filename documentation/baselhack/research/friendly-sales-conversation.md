# Friendly sales conversations for Paxi

Research date: 2026-10-31. Status: research and proposed conversation design; this file does not change the running agent.

## Recommendation

Use a consultative conversation: understand the person's situation, reflect their priorities, explain the value of the next step, and invite them to choose it. The pitch is an invitation to understand their situation better and, if wanted, speak with a Pax colleague. Paxi's current role excludes recommending or pitching products; see the [persona](../../../code/voice-agent/persona.md) and [voice documentation](../../../code/voice-agent/README.md).

The commercial purpose should be clear. Friendly language should make that purpose easier to understand, without disguising it as friendship or neutral advice. Introduce Paxi as a digital assistant of Pax, then use short sentences, informal “du” and Swiss Standard German. The examples below are original draft copy, not research quotations or financial advice.

## What the research supports

| Mechanism | Research finding | Proposed application | Evidence limit |
|---|---|---|---|
| Perceived responsiveness | Huang et al. found that question asking, especially follow-up questions, increased liking in live conversations, with perceived responsiveness explaining the relationship. [1] | Pick up something the person actually mentioned before moving to the next topic. | Human conversations and speed dating do not establish insurance conversion or trust in an AI. More questions can still feel intrusive. |
| Autonomy | Self-determination theory identifies autonomy, competence and relatedness as central motivational needs. [2] | Give genuine choices, explain unfamiliar terms and let the person correct the summary. | A broad motivation framework, not a validated script for this product. |
| Psychological reactance | Miller et al. investigated controlling language and restoration of freedom in health messages. Their findings support attention to language that threatens choice. [3] | Replace commands with a clear invitation, and actually honour refusal. | Health-message experiments do not prove that any single phrase improves Paxi outcomes. |
| Reflective listening | SAMHSA's motivational interviewing guidance recommends open questions, reflections and summaries, with respect for self-direction. [4] | Briefly reflect the answer before asking one relevant question. | Clinical guidance is borrowed for communication technique; Paxi is not providing therapy. |

These are plausible design mechanisms, not psychological buttons that reliably make someone buy. We have no Paxi-specific evidence of increased sales, better disclosure or reduced pressure. The recommendations below are hypotheses to evaluate.

## Conversation and psychological cues

“Trigger” here means a conversational cue that helps someone engage voluntarily. Each cue must remain useful even when the person declines the next step.

| Cue | Why try it | Example | Failure to avoid |
|---|---|---|---|
| Clear purpose | Makes the request understandable. | “Ich möchte deine Situation kennenlernen, damit ein Kollege von mir ein passendes Gespräch vorbereiten kann.” | Hiding that this is a Pax conversation. |
| Real choice | Applies autonomy support. | “Wir können weitermachen oder hier aufhören. Was passt dir?” | Offering a choice and ignoring the answer. |
| A relevant follow-up | Signals attention to what was said. | “Du hast den Job gewechselt. Wie sieht dein Pensum jetzt aus?” | Asking about children again after the person already answered. |
| A tentative reflection | Checks understanding without claiming to know their feelings. | “Dir ist vor allem wichtig, dass die laufenden Kosten gut tragbar bleiben. Habe ich das richtig verstanden?” | Inventing anxiety, personality or buying readiness from tone of voice. |
| A reason before sensitive data | Gives context for the request. | “Das Einkommen hilft später bei der Einordnung deiner Situation. Möchtest du es hier angeben?” | Claiming every personal detail is mandatory. |
| A small, explicit next step | Makes the proposal concrete; this is a design hypothesis. | “Möchtest du besprechen, welche Fragen du einem Kollegen von mir stellen könntest?” | Using a small yes as consent to contact, share data or buy. |
| A correction opportunity | Helps establish shared understanding; this is a design hypothesis. | “Ich habe Teilzeit und einen möglichen Umzug notiert. Was soll ich korrigieren?” | Treating an inferred answer as confirmed. |

Do not add fake scarcity, unsupported social proof (“alle in deinem Alter…”), guilt about family, flattery for disclosure, fear scenarios, or a sequence of easy questions intended to make refusal harder. Do not manufacture reciprocity by implying that a helpful explanation creates an obligation to continue. These are design exclusions, not claims that such tactics never influence behaviour.

## Suggested conversation structure

The sequence is flexible. Follow the person's story, skip already known details and keep factual questions relevant to the agreed purpose.

1. **Introduce and invite.** Identify the AI and Pax, explain the purpose, then ask whether the person wants to begin. State a duration only if it is measured and credible.
2. **Discover the life situation.** Start with an open question about everyday life. Let the person decide where to begin.
3. **Reflect and follow up.** Acknowledge one concrete detail; ask one related question. Avoid a fixed quota of small talk or repeated praise.
4. **Explain sensitive transitions.** Say why a detail helps. Allow skipping it without argument. Permission for one question is not blanket permission for other topics.
5. **Summarise and check.** Separate what the person said from what remains unclear. Ask for corrections before building on an inference.
6. **Offer a next step.** Connect it to their stated priority. Accept “no” and “later”; never imply that contact has been arranged unless the app has actually done so with agreement.

A reflection may be a complete turn. Do not force a question immediately after a disclosure about grief, illness or financial difficulty. Ask whether the person wants to continue before returning to intake.

## A short opening pitch

> Hi, ich bin Paxi, der digitale Assistent von Pax. Ich möchte deine Situation kennenlernen, damit ein Kollege von mir ein Gespräch zu deinen Vorsorgefragen vorbereiten kann. Du entscheidest, was du erzählen möchtest. Passt es dir, jetzt anzufangen?

If the person agrees:

> Erzähl mal: Wie sieht dein Alltag gerade aus?

A short version for someone in a hurry:

> Gerne kurz. Wir gehen eine Frage nach der anderen durch, und du kannst jederzeit stoppen. Was ist dir bei dem Gespräch heute am wichtigsten?

Do not promise “nur zwei Minuten” while still requiring the whole questionnaire.

## Worked conversation: life first, proposal later

Synthetic example; optional branches illustrate different choices. The script is not a questionnaire order.

**Paxi:** Hi, ich bin Paxi, der digitale Assistent von Pax. Ich möchte deine Situation kennenlernen, damit ein Kollege von mir ein Gespräch zu deinen Vorsorgefragen vorbereiten kann. Passt es dir, jetzt anzufangen?

**Person:** Ja, ich möchte mal etwas Ordnung reinbringen.

**Paxi:** Was möchtest du dabei als Erstes klären?

**Person:** Wir haben eine Tochter bekommen, und ich arbeite jetzt weniger.

**Paxi:** Mit deiner Tochter hat sich auch dein Arbeitsalltag verändert. Wie sieht dein Pensum jetzt aus?

**Person:** Achtzig Prozent.

**Paxi:** Achtzig Prozent, verstanden. Was ist dir mit dieser Veränderung für eure Zukunft besonders wichtig?

**Person:** Dass wir unsere laufenden Kosten tragen können, auch wenn mal etwas passiert.

**Paxi:** Dir geht es um die laufenden Kosten und darum, wie ihr als Familie aufgestellt seid. Habe ich das richtig verstanden?

**Person:** Genau.

**Paxi:** Um das später einzuordnen, hilft auch dein Einkommen. Möchtest du dein jährliches Bruttoeinkommen hier angeben?

**Person:** Lieber nicht.

**Paxi:** In Ordnung, das lassen wir offen. Welche Pläne stehen bei euch als Nächstes an?

**Person:** Vielleicht umziehen, aber noch nichts Konkretes.

**Paxi:** Ein möglicher Umzug ist also noch offen. [Continue only with relevant, unanswered questions the person is willing to discuss.]

At the end of the agreed conversation:

**Paxi:** Du arbeitest achtzig Prozent, und dir sind die laufenden Kosten für eure Familie besonders wichtig. Der Umzug ist noch offen, und dein Einkommen hast du hier nicht angegeben. Was soll ich an dieser Zusammenfassung korrigieren?

**Person:** Das passt so.

**Paxi:** Möchtest du als nächsten Schritt mit einem Kollegen von mir anschauen, welche Fragen dazu noch offen sind?

**If yes:** Explain the actual available handoff, what information would be shared and obtain the relevant agreement. Do not say “Termin gebucht” without a successful booking.

**If no:** “Alles klar, dann lassen wir es dabei. Danke für das Gespräch.”

## Handling hesitation without a rebuttal script

| Person says | Suggested response | Next action |
|---|---|---|
| “Willst du mir etwas verkaufen?” | “Ich bin der digitale Assistent von Pax. Ich sammle hier Informationen für ein mögliches Gespräch mit einem Kollegen von mir. Produkte empfehle ich dir hier keine.” | Ask whether they want to continue; accept the answer. |
| “Ich habe schon eine Versicherung.” | “Verstanden. Gibt es trotzdem etwas, das du klären möchtest?” | If not, close; do not imply existing cover is inadequate. |
| “Ich möchte mein Einkommen nicht sagen.” | “In Ordnung, das lassen wir offen.” | Move on; do not bargain or infer the value. |
| “Ich habe keine Zeit.” | “Möchtest du hier aufhören?” | Stop if requested. Offer resume only where the app supports it. |
| “Was würdest du kaufen?” | “Konkrete Produkte bespreche bitte mit einem Kollegen von mir. Welche Frage möchtest du für das Gespräch festhalten?” | Capture their question without recommending a product. |
| “Ich muss nachdenken.” | “Klar, nimm dir die Zeit.” | No urgency claim or repeated closing question. |
| “Du fragst zu viel.” | “Verstanden. Möchtest du das Gespräch beenden?” | Reduce scope only if they choose to continue. |

## Gaps between this proposal and current behaviour

This section records design changes to consider, not implemented changes.

- The current persona encourages about one new detail per exchange and usually a question or next step every turn. Allow reflection-only turns and pauses when appropriate.
- The current persona says to close only after all details are complete or handed to a colleague. Add an explicit exception for a person's request to stop; completion is subordinate to that choice.
- The [voice README](../../../code/voice-agent/README.md) describes a second attempt after an initial refusal. Proposed distinction: one clarification may help with ambiguity; an explicit refusal should end that topic unless the person reopens it. Coordinate prompt and extraction/status behaviour before changing this policy.
- The current closing copy says a colleague will get in touch. Replace this with an invitation unless an actual, agreed contact workflow exists.
- The current persona suggests an approximately ten-minute introduction. Measure duration before presenting it as an expectation.

Do not paste this entire research file into the system prompt. Once agreed, translate the chosen behaviours into concise persona instructions and check that backend priorities, completion nudges and refusal handling support them.

## How to evaluate the proposal

Use synthetic role-play first, then voluntary user testing. Compare the present script with the proposed approach while keeping task and scenario comparable. Do not optimise only for collected fields or handoff acceptance.

Suggested review measures (project proposals, not validated research scales):

- User ratings for feeling heard, clarity of purpose and perceived pressure, each on a consistent 1–5 scale.
- Whether a refusal is respected without another attempt, and whether an explicit stop ends the interaction.
- Whether follow-ups use an actual prior answer, and whether previously answered questions are repeated.
- Accuracy of the final summary, including whether inferred values are presented for correction.
- Whether the user understands what the next step entails and can decline it.
- Time, interruptions and questionnaire completion as secondary usability measures.

Include cases with an explicit refusal, an emotional disclosure, existing insurance, a language switch, an impatient person and a request to stop while fields remain open. Treat invented personal facts, ignored stop requests and fabricated handoffs as failures regardless of completion rate. Report small test results as exploratory; they do not establish conversion effects.

## Sources and reading notes

1. Huang, K., Yeomans, M., Brooks, A. W., Minson, J., & Gino, F. (2017). *It Doesn't Hurt to Ask: Question-Asking Increases Liking*. Journal of Personality and Social Psychology, 113(3), 430–452. [Original paper, author-hosted PDF](https://www.hbs.edu/ris/Publication%20Files/Huang%20et%20al%202017_6945bc5e-3b3e-4c0a-addd-254c9e603c60.pdf). Read the paper's abstract and study context; evidence concerns interpersonal liking, not insurance purchases.
2. Ryan, R. M., & Deci, E. L. (2000). *Self-Determination Theory and the Facilitation of Intrinsic Motivation, Social Development, and Well-Being*. American Psychologist, 55(1), 68–78. [Author-hosted paper](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf). Theoretical foundation for autonomy, competence and relatedness; not a sales-script experiment.
3. Miller, C. H., Lane, L. T., Deatrick, L. M., Young, A. M., & Potts, K. A. (2007). *Psychological Reactance and Promotional Health Messages: The Effects of Controlling Language, Lexical Concreteness, and the Restoration of Freedom*. Human Communication Research, 33(2), 219–240. [Publisher record](https://onlinelibrary.wiley.com/doi/10.1111/j.1468-2958.2007.00297.x). Publisher search record and the [2019 literature review](https://www.frontiersin.org/journals/communication/articles/10.3389/fcomm.2019.00056/full) were consulted; the full original article was not inspected. No numerical effect or universal wording rule is asserted here.
4. SAMHSA (2019). *Enhancing Motivation for Change in Substance Use Disorder Treatment*, TIP 35, Chapter 3: Motivational Interviewing as a Counseling Style. [Official chapter](https://www.ncbi.nlm.nih.gov/books/NBK571068/). Search-indexed guidance on open questions, reflective listening and autonomy was available; direct retrieval was blocked. Use as communication background, not evidence for sales performance.

All Paxi examples, sequencing choices, exclusions and evaluation measures are project recommendations. They have not been tested with this agent. No source establishes a universal psychological trigger, ideal question count, speaking ratio or conversion uplift for Paxi.
