import { Module } from '@nestjs/common';
import { DeduplicationService } from './deduplication.service';
import { CategorizationService } from './categorization.service';

@Module({
  providers: [DeduplicationService, CategorizationService],
  exports: [DeduplicationService, CategorizationService],
})
export class RuleEngineModule {}
