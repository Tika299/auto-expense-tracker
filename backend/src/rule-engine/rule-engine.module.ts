import { Module } from '@nestjs/common';
import { DeduplicationService } from './deduplication.service';
import { CategorizationService } from './categorization.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  providers: [
    DeduplicationService,
    ReconciliationService,
    CategorizationService,
  ],

  exports: [DeduplicationService, ReconciliationService, CategorizationService],
})
export class RuleEngineModule {}
