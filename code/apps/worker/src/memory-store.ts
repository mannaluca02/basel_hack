import {emptyDatabase, WorkflowError} from '../../api/dist/insurance/types.js';
import type {CaseStore, BootstrapCredentials} from '../../api/dist/insurance/store.js';

// shortcut: volatile, unencrypted synthetic state for the feasibility spike; replace with DO persistence.
export function memoryStore(credentials: BootstrapCredentials): CaseStore {
  let state=emptyDatabase(), closed=false, queue: Promise<unknown>=Promise.resolve();
  const assertOpen=()=>{if(closed)throw new WorkflowError('STORE_CLOSED',503);};
  return {
    directory: 'spike:memory',
    async credentials(){return credentials;},
    snapshot(){assertOpen();return structuredClone(state);},
    view(read){assertOpen();return structuredClone(read(state));},
    transaction(fn){
      const next=queue.then(async()=>{
        assertOpen();const copy=structuredClone(state);const result=await fn(copy);
        if(Buffer.byteLength(JSON.stringify(copy))>20_000_000)throw new WorkflowError('STORE_CAPACITY',413);
        state=copy;return structuredClone(result);
      });
      queue=next.catch(()=>{});return next;
    },
    async close(){await queue;closed=true;},
  };
}
