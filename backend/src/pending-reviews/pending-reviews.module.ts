import { Module } from '@nestjs/common';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { PendingReviewsController } from './pending-reviews.controller';
import { PendingReviewsService } from './pending-reviews.service';

@Module({
  imports: [RuleEngineModule],
  controllers: [PendingReviewsController],
  providers: [PendingReviewsService],
  exports: [PendingReviewsService],
})
export class PendingReviewsModule {}
