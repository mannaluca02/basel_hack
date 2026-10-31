import type { InsuranceCase } from './types.js';
import { sha256Json } from '../calculation/hash.js';
import { personFor } from './draft-proposals.js';
export function ambiguityDialogue(c:InsuranceCase){
  const hash=sha256Json(c.draft),version=c.confirmedVersions.at(-1)?.version??null;
  return c.ambiguities.map(a=>{
    const batch=a.status==='open'?[...c.proposalBatches].reverse().find(b=>b.status==='proposed'&&b.basisDraftHash===hash&&b.expectedProfileVersion===version&&
      b.resolvesAmbiguityIds.includes(a.id)&&b.changes.some(x=>x.path===a.path&&x.personId===a.personId)&&personFor(c.draft,a.path)===a.personId):undefined;
    return {...a,dialogueStatus:a.status==='resolved'?'resolved' as const:batch?'awaiting_customer_acceptance' as const:'needs_answer' as const,answerBatchId:batch?.id??null};
  });
}
export const pendingAcceptanceIds=(dialogue:ReturnType<typeof ambiguityDialogue>)=>[...new Set(dialogue.flatMap(a=>a.answerBatchId?[a.answerBatchId]:[]))];
/** Intake paths can address a person by ID, while draft mutation paths use an index plus the same stable person ID. */
export function waitingForAnswer(c:InsuranceCase,path:string,dialogue:ReturnType<typeof ambiguityDialogue>){
  const matches=(a:ReturnType<typeof ambiguityDialogue>[number])=>{
    const aliases=[a.path],match=a.path.match(/^(financial|insurance)\.persons\.(\d+)\.(.*)$/);
    if(match&&a.personId)aliases.push(`${match[1]}.persons.${a.personId}.${match[3]}`);
    return aliases.some(p=>p===path||p.startsWith(path+'.')||path.startsWith(p+'.'));
  };
  if(dialogue.some(a=>a.dialogueStatus==='needs_answer'&&matches(a)))return true;
  return !dialogue.some(a=>a.dialogueStatus==='awaiting_customer_acceptance'&&matches(a));
}
