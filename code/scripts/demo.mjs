import 'reflect-metadata';
import { CalculationService,createAnalysisRequest } from '../apps/api/dist/calculation/calculation.service.js';
import { loadDemoSnapshot,DEMO_SCENARIOS } from '../apps/api/dist/demo/fixtures.js';
import { ReplayProvider } from '../apps/api/dist/logismata/client.js';

const service=new CalculationService();const snapshot=await loadDemoSnapshot();
for(const [name,scenario] of Object.entries(DEMO_SCENARIOS)) {
  const result=service.analyze(createAnalysisRequest(snapshot,scenario,`demo_${name}_v1`));
  console.log(JSON.stringify({scenario:name,mode:result.dataClassification,metrics:result.metrics.filter(m=>['cashflowAnnual','affordableContributionAnnual','freeCapital','home_fundingGap'].includes(m.id)),
    progress:result.progress.percent,reviewOpen:result.progress.reviewOpen,issues:result.issues.map(i=>i.code)},null,2));
}
const replay=await ReplayProvider.load();
for(const op of ['risk','retirement']) {
  const result=await replay.execute(op,replay.exampleRequest(op));
  console.log(JSON.stringify({providerExample:op,status:result.status,mode:result.provenance.mode,issues:result.issues.map(i=>i.code)},null,2));
}
