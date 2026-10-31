import { Module } from '@nestjs/common';
import { CalculationModule } from './calculation/calculation.module.js';
import { DemoController } from './demo/demo.controller.js';

@Module({imports:[CalculationModule],controllers:[DemoController]})
export class DemoAppModule {}
