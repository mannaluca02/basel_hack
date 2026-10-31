import { Body,Controller,Get,Post,HttpCode,BadRequestException,Param } from '@nestjs/common';
import { z } from 'zod';
import { CalculationService,createAnalysisRequest } from '../calculation/calculation.service.js';
import { DEMO_SCENARIOS,loadDemoSnapshot } from './fixtures.js';
import { ReplayProvider } from '../logismata/client.js';
import type { Operation } from '../logismata/contracts.js';

const DemoRequest=z.object({fixtureId:z.literal('household'),scenario:z.enum(['baseline','family','home'])}).strict();
const ProviderOperation=z.enum(['saving3aLimits','ageLimits','riskBase','risk','retirementBase','retirement']);
/** Synthetic fixture harness only. Real case endpoints are owned by the integrating Auth/CaseModule. */
@Controller('api/demo')
export class DemoController {
  constructor(private readonly calculation:CalculationService) {}
  @Get('health') health() {return {service:'pax-calculation-demo',status:'ok',dataMode:'synthetic-only',providerMode:'replay'};}
  @Get('fixtures') fixtures() {return [{id:'household',scenarios:Object.keys(DEMO_SCENARIOS),dataClassification:'synthetic'}];}
  @Post('calculations') @HttpCode(200)
  async analyze(@Body() body:unknown) {
    const parsed=DemoRequest.safeParse(body);
    if(!parsed.success) throw new BadRequestException({code:'INVALID_INPUT',fields:parsed.error.issues.map(i=>i.path.join('.'))});
    const c=await loadDemoSnapshot();const scenario=DEMO_SCENARIOS[parsed.data.scenario];
    return this.calculation.analyze(createAnalysisRequest(c,scenario,`demo_${parsed.data.scenario}_v1`));
  }
  @Get('provider-examples/:operation')
  async providerExample(@Param('operation') name:string) {
    const operation=ProviderOperation.safeParse(name);
    if(!operation.success) throw new BadRequestException({code:'UNSUPPORTED_OPERATION'});
    const replay=await ReplayProvider.load();const op=operation.data as Operation;
    return replay.execute(op,replay.exampleRequest(op));
  }
}
