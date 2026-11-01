import { providerFetch } from '../provider-fetch.js';
import { z } from 'zod';
import { WorkflowError } from '../insurance/types.js';

/**
 * The analysis model of every extraction: GPT-6 Luna on the fast tier with medium reasoning. Medium
 * found every value of dense sentences where low missed some, at the same speed (about 1.3 s per
 * sentence, measured 2026-11-01).
 */
export const ANALYSIS_MODEL={model:'gpt-6-luna',service_tier:'fast',reasoning:{effort:'medium'}} as const;
export type ResponsesRequest={model:string;service_tier?:'fast';store:false;instructions:string;input:{role:'user';content:string}[];
  reasoning?:{effort:'low'|'medium'};
  tools:Record<string,unknown>[];tool_choice:'auto';parallel_tool_calls:false;max_output_tokens:number};
export type ResponsesTransport=(request:ResponsesRequest,signal:AbortSignal)=>Promise<unknown>;

const ResponseSchema=z.object({status:z.literal('completed'),error:z.unknown().optional(),output:z.array(z.object({type:z.string(),name:z.string().optional(),arguments:z.string().optional(),
  status:z.string().optional(),content:z.array(z.object({type:z.string()}).passthrough()).optional()}).passthrough()).max(20)});

/** Shared by every Responses caller: one abort, timeout and transport-error mapping. */
export async function callResponses(transport:ResponsesTransport,request:ResponsesRequest,signal?:AbortSignal):Promise<unknown>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  try{
    const interrupted=new Promise<never>((_,reject)=>{
      controller.signal.addEventListener('abort',()=>reject(new Error('Model request aborted')),{once:true});
      timer=setTimeout(cancel,15000);
    });
    return await Promise.race([interrupted,transport(request,controller.signal)]);
  }catch{
    if(signal?.aborted)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
    if(controller.signal.aborted)throw new WorkflowError('MODEL_TIMEOUT',504);
    throw new WorkflowError('MODEL_TRANSPORT_FAILED',502);
  }finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
/** The single function call of a completed response (undefined if none); anything unexpected throws. */
export function submittedCall(raw:unknown){
  const response=ResponseSchema.parse(raw),calls=response.output.filter(item=>item.type==='function_call');
  if(response.error!=null||calls.length>1||response.output.some(item=>!['reasoning','message','function_call'].includes(item.type)||
    (item.status!==undefined&&item.status!=='completed')||item.content?.some(content=>content.type==='refusal')))throw new Error();
  return calls[0];
}

/** Only an explicitly configured server transport can make a later synthetic acceptance call. */
export function openAiResponsesTransport(apiKey:string):ResponsesTransport {
  if(!apiKey.trim())throw new WorkflowError('MODEL_KEY_REQUIRED',503);
  return async(request,signal)=>{
    const timeout=AbortSignal.timeout(15000);
    const response=await providerFetch(fetch,'https://api.openai.com/v1/responses',{method:'POST',signal:signal?AbortSignal.any([signal,timeout]):timeout,
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(request)});
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new WorkflowError('MODEL_TRANSPORT_FAILED',502);}
    return response.json();
  };
}
