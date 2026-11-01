# Feature inventory for presentation Q&A

Working inventory from repository modules, 2026-10-31. Presence in source is evidence of implementation work, not proof of a fully verified production journey. Final claims must match the demonstrated deployment. The backup slide summarises this inventory; this file carries the detail.

| Area | Capabilities found in the project | Source |
|---|---|---|
| Voice | WebRTC voice, German/French/Italian/English language handling, voice handoffs, recorded intro, interruptions, silence/inactivity management, resume, question priorities | [Voice README](../code/voice-agent/README.md), [browser client](../code/voice-agent/public/paxi-voice.js) |
| Conversation data | Transcript fragments, questionnaire extraction/validation, progress, refusal states, JSON logs, final life-context extraction | [Voice server](../code/voice-agent/server.mjs), [questionnaire](../code/voice-agent/questionnaire.json) |
| Avatar | Activity and playback events, expressions, audio attachment and animated responses | [Avatar interface](../code/avatar-prototype/AVATAR-INTERFACE.md), [avatar component](../code/avatar-prototype/pax-avatar.js) |
| Web experience | Angular app, voice/avatar integration, case voice adapter, multilingual assets, chart dependencies | [Web app](../code/apps/web), [case voice adapter](../code/apps/web/src/app/core/voice/paxi-case-voice.ts) |
| Case backend | Sessions/roles, shared JSON case, structured intake, persistence, revisions and domain workflow | [Backend README](../code/README.md), [insurance modules](../code/apps/api/src/insurance) |
| Calculations | Logismata client/normalisation, pension and household scenarios, graph context | [Logismata modules](../code/apps/api/src/logismata), [graph](../code/apps/api/src/insurance/graph.ts) |
| Advice and proposal | Advisory/comparison modules, product families, draft proposals, suitability and review workflow | [Advisory](../code/apps/api/src/insurance/advisory.ts), [draft proposals](../code/apps/api/src/insurance/draft-proposals.ts), [suitability](../code/apps/api/src/insurance/suitability.ts) |
| Next steps | Human handover, documents, dossier, digital tasks and demo portal journey described by the backend | [Handover](../code/apps/api/src/insurance/human-handover.ts), [documents](../code/apps/api/src/insurance/documents.ts), [backend README](../code/README.md) |

## Boundaries and limitations

- A hackathon prototype; no production release or approval for real customer data is established by this deck.
- Backend documentation limits the PoC to synthetic data. Use synthetic customers in every recording.
- Voice extraction and language detection can be delayed or incorrect. Validate and correct extracted information.
- Live interaction depends on microphone permission, browser audio rules, network and upstream services.
- The voice persona excludes direct product recommendations. Any proposed plan shown must come from the actual advisor/calculation path; it is not a binding policy.
- Suitability/review is a distinct workflow, not satisfied simply by completing the conversation.
- Standalone voice and case-backend storage/authentication differ. Do not describe the whole system as having identical protections without checking the deployed integration.
- A handover module does not by itself establish a booked meeting or completed external contact.
- No quantitative claim about conversion, accuracy, latency or time saved is supported by this presentation yet.

## Further implementation ideas

- Verify the full recording journey end to end and test state consistency across voice, case and calculations.
- Measure extraction quality and latency with synthetic multilingual cases, corrections and interruption tests.
- Improve accessibility, keyboard/text alternatives, captions and mobile browser testing.
- Evaluate respectful refusals and stop behaviour with users; see [conversation research](../documentation/baselhack/research/friendly-sales-conversation.md).
- Define consent, ownership, retention and production identity/hosting across the whole integration.
- Add operational monitoring and recovery for partial service failures.
- Agree the real advisor/contact workflow and production approval process with Pax.

## Architecture slide reading

The diagram is a component overview, not a packet-level sequence diagram. The voice service creates Live sessions; browser audio uses WebRTC with the speech provider. Transcript processing produces structured context and progress. The web app also has a case voice adapter and backend modules for advice/calculation. Confirm which paths the selected demo exercises before explaining them as one verified flow. Source pointers: voice server, case voice adapter, backend README and Logismata client above.

## B04 review — 2026-11-01

Removed the financial-assumptions, integration-coverage and different-stores topics from the slide. New limitation wording distinguishes missing production experiences from existing prototype code:

- `insurance/auth.ts` stores sessions through `EncryptedCaseStore`: customer sessions expire after one hour; case-scoped agent grants expire after at most 15 minutes. “No persistence” would be inaccurate. Long-lived cross-device continuity remains a gap.
- Demo logins create anonymous IDs and access-code roles, not full customer account management.
- `insurance/telemetry.ts` implements prototype funnel/NPS aggregates; the store includes audit records. “No backend or tracking” would be inaccurate; production operations monitoring is the gap.
- Human-handover modules and voice steering exist. A proactive live observer/intervention console is not established.
- Voice naturalness is a team evaluation topic, not a benchmark result. ElevenLabs has both TTS and an agent stack with interruption controls: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow . The deck describes the chosen full-duplex architecture without claiming ElevenLabs cannot be interrupted.
