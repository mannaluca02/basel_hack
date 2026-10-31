/** Local cancellation only: no background calls or cross-process notification. SSE carries the persisted handover signal. */
export class DigitalTasks {
  private tasks=new Map<string,Set<AbortController>>();
  begin(caseId:string,external?:AbortSignal){
    const controller=new AbortController(),set=this.tasks.get(caseId)??new Set<AbortController>();set.add(controller);this.tasks.set(caseId,set);
    return {signal:external?AbortSignal.any([controller.signal,external]):controller.signal,finish:()=>{set.delete(controller);if(!set.size)this.tasks.delete(caseId);}};
  }
  cancel(caseId:string){for(const controller of this.tasks.get(caseId)??[])controller.abort();}
  close(){for(const caseId of this.tasks.keys())this.cancel(caseId);}
}
