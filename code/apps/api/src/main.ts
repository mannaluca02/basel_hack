import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { createLifeInsuranceApp } from './insurance/app.js';
import { liveAppOptions,livePort,startVoiceAgent } from './live-options.js';

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=livePort(process.env);
  const {app,runtime}=await createLifeInsuranceApp(liveAppOptions(process.env));
  try{await app.listen(port,'127.0.0.1');}catch(error){await runtime.close();throw error;}
  const paxi=await startVoiceAgent(process.env);
  if(paxi.warning)console.warn(paxi.warning);
  console.info(`Pax life-insurance backend (live calculator): http://127.0.0.1:${port}/api/status`);
  if(process.env.PAX_DEMO_START==='1')console.info('Demo start without access code: POST /api/demo/start');
  console.info(`Local demo access codes: ${runtime.store.directory}/access-codes.json`);
}
