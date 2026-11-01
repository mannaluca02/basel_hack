import type { InsuranceDraft, ProposalChangeInput } from '@pax/contracts';
import { ANALYSIS_MODEL } from '../model/responses.js';
import { intakeTool } from './lab-intake.js';
import { answersTool, answerTargets, pendingView } from './lab-questions.js';
import { setupTool } from './lab-setup.js';

/**
 * GPT-Live's background model takes the notes: when the person gave a detail, GPT-Live hands the
 * conversation to GPT-6 Luna (Responses delegation), which calls the same three extractions the
 * backend runs otherwise (setup facts, intake fields, open profile questions) as tools. The
 * browser receives the calls and sends them with the customer turn to `voice-lab/turns`, which
 * validates them exactly like its own model output. No backend model call per sentence.
 */
export const REPORT_TOOLS = ['submit_setup_facts', 'submit_intake_observations', 'submit_answers'] as const;

const INSTRUCTIONS = 'You take notes for Paxi, a voice advisor, while Paxi talks with a person. You are called when the person has just said something. ' +
  'Call every listed tool exactly once, all in one go, with what the person\'s latest words give; a tool with nothing to submit gets an empty list (or null values). ' +
  'Follow each tool\'s description. Do not answer the person and do not suggest what Paxi should say. After the tool results, reply only with the single word: noted.';

/** Appended to Paxi's prompt when the session has the background model. */
export const REPORT_POLICY = `
## Taking notes
A background helper records the details the person gives. Generate <|SpawnThinking|> right after every turn of the person that states, confirms or corrects a detail about them or their household: age, work and employment rate, income, partner, children, housing, pension fund, pillar 3a, savings, assets, debts, insurance, goals, retirement plans; also a short answer such as "Ja", "2200" or "mit 63".
Do not generate <|SpawnThinking|> for smalltalk, for questions to you or when the person declines.
Keep talking normally while the helper works: never wait for it, never mention it, and never read its result aloud.
`;

/** Open batches the next proposal replaces (and carries): proposed, with changes, without a clarification. */
export const replaceable = <T extends { status: string; changes: unknown[]; ambiguityIds?: string[] | undefined }>(batches: T[]) =>
  batches.filter(batch => batch.status === 'proposed' && batch.changes.length > 0 && !batch.ambiguityIds?.length);

type Batch = { status: string; changes: ProposalChangeInput[]; ambiguityIds?: string[] | undefined };

/**
 * The fields the open profile questions may take this turn (answerTargets on the draft with the
 * open proposals). Fields of a person not accepted yet wait for the next turn (paths must name a known person).
 */
export function liveTargets(draft: InsuranceDraft, batches: Batch[], caseId: string, personIds: string[]) {
  return answerTargets(pendingView(draft, replaceable(batches).flatMap(batch => batch.changes), caseId))
    .filter(target => { const person = /^(?:insurance|financial)\.persons\.([^.]+)\./.exec(target.key)?.[1]; return !person || personIds.includes(person); });
}

/**
 * The background model for the case as it is now. Without a person (live start) it reads the setup
 * facts and the intake fields (the browser keeps those until the person exists); with one, the
 * intake fields and the open profile questions. `asked` is the question Paxi is on.
 */
export function liveDelegation(draft: InsuranceDraft, batches: Batch[], caseId: string, asked?: string) {
  const personIds = draft.financial?.persons.map(person => person.id) ?? [];
  const answers = personIds.length ? answersTool(liveTargets(draft, batches, caseId, personIds), asked) : null;
  const tools = personIds.length ? [intakeTool(), ...(answers ? [answers] : [])] : [setupTool(), intakeTool()];
  return { type: 'responses' as const, responses: { ...ANALYSIS_MODEL, instructions: INSTRUCTIONS, tools, tool_choice: 'auto' as const, parallel_tool_calls: true } };
}
export type LiveDelegation = ReturnType<typeof liveDelegation>;
