import { LiveLogismataProvider } from '../apps/api/dist/logismata/client.js';

// Explicit metadata-only smoke: no customer/health payload, no credential logging.
const token=process.env.LOGISMATA_BEARER_TOKEN;
if(!token) throw new Error('Set LOGISMATA_BEARER_TOKEN in the server environment');
const provider=new LiveLogismataProvider({token});
try {
  const result=await provider.execute('saving3aLimits',{});
  console.log(JSON.stringify({operation:result.operation,status:result.status,mode:result.provenance.mode,metricCount:result.metrics.length}));
} catch(error) {
  console.error(JSON.stringify({code:error.code??'SMOKE_FAILED'}));process.exitCode=1;
}
