import { Module } from '@nestjs/common';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { ObservationsController } from './observations.controller';
import { ObservationsService } from './observations.service';

@Module({
  imports: [RuleEngineModule],
  controllers: [ObservationsController],
  providers: [ObservationsService],
  exports: [ObservationsService],
})
export class ObservationsModule {}
