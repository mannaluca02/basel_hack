import { Module } from '@nestjs/common';
import { CalculationService } from './calculation.service.js';

/** Import into Earnie's authorized case backend; domain module owns no sessions or customer storage. */
@Module({providers:[CalculationService],exports:[CalculationService]})
export class CalculationModule {}
