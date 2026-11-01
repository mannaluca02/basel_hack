import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CreateVoiceSession } from '@pax/contracts';
import { WorkflowError } from '../insurance/types.js';
import { INTAKE_FIELDS } from './lab-intake.js';

interface Skill { file:string; name:string; description:string; body:string; }
interface SkillModule { loadSkills(directory:string):Promise<Skill[]>; skillsPrompt(skills:Skill[]):string; }
const source = new URL('../../../../voice-agent/', import.meta.url);

/** Use Dario's files and loader directly, so assigned:true stays the single skill configuration. */
async function sources() {
  const loader = await import(new URL('skills.mjs', source).href) as SkillModule;
  const [persona,skills] = await Promise.all([
    readFile(new URL('persona.md', source),'utf8'), loader.loadSkills(fileURLToPath(new URL('skills/',source))),
  ]);
  return {persona,skills,loader};
}

export async function voicePromptSettings() {
  const {skills} = await sources();
  return {skills:skills.map(({file,name,description})=>({id:file,name,description})),
    priorities:[...INTAKE_FIELDS], defaultTimeBudgetMinutes:10};
}

export async function buildVoicePrompt(locale:string, settings:CreateVoiceSession['conversationSettings'] = {}) {
  const {persona,skills,loader} = await sources();
  const ids=settings.skillIds??skills.map(skill=>skill.file);
  if(ids.some(id=>!skills.some(skill=>skill.file===id)))throw new WorkflowError('VOICE_SKILL_NOT_AVAILABLE',422);
  const priorities=settings.priorities??[];
  if(priorities.some(id=>!(INTAKE_FIELDS as readonly string[]).includes(id)))throw new WorkflowError('VOICE_TOPIC_NOT_AVAILABLE',422);
  return `${persona}\n\n${loader.skillsPrompt(skills.filter(skill=>ids.includes(skill.file)))}

## Debug-app conversation settings
Current conversation language: ${locale}. Start in that language. Use informal address, Swiss Standard German for de.
Time available: ${settings.timeBudgetMinutes??10} minutes. Adapt the pace to this budget. If you announce a duration, use this budget rather than the persona's ten-minute example.
Priority topics: ${priorities.length?priorities.join(', '):'follow the person’s story'}.
The app reads the conversation logs and extracts details in the background. You only converse; do not read a questionnaire or announce backend operations.
The supported intake topics are: ${INTAKE_FIELDS.join(', ')}. Quiet app notes supply captured details and remaining topics; their order is not a script.
Start with a brief invitation to describe their current life with work, family and housing. Do not open with a gross-income form question.
Backchannel policy: rarely backchannel, never talk over the person. Interruption policy: stop when the person starts speaking to you.

## Application boundaries — these override conflicting persona and skill examples
This is a live voice demonstration using invented details only. Never request real names, full birth dates, identifying or health data.
Use only what the person states; never invent amounts, average ranges, infer risk appetite, or calculate pension/tax limits. Clarify unclear period, currency or gross/net basis.
Captured details are unconfirmed proposals. Only backend review can accept a change or confirm the whole profile. Never claim either has happened.
The Proposing plans skill can explain possible directions, but a personalised financial recommendation or exact calculation requires backend-approved facts. Do not invent benefits, premiums, guarantees or returns.
You do everything yourself and never hand over: never say that a colleague, specialist or advisor will look at, calculate, clarify or complete something, and never promise a call or contact. While details are open, keep asking; once the app note says done, walk the person through the analysis it gives (products and key figures) and the next step in the app.
An explicit wish to stop wins. Stop immediately on application handover; never insist on finishing questions.
`;
}
