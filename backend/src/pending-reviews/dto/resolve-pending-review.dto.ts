import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PENDING_REVIEW_DECISIONS = [
  'CONFIRM_DUPLICATE',
  'KEEP_BOTH',
  'CONFIRM_INTERNAL_TRANSFER',
  'KEEP_SEPARATE',
] as const;

export type PendingReviewDecision = (typeof PENDING_REVIEW_DECISIONS)[number];

export class ResolvePendingReviewDto {
  @IsIn(PENDING_REVIEW_DECISIONS)
  decision!: PendingReviewDecision;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  note?: string;
}
