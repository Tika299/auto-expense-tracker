import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolvePendingReviewDto {
  @IsIn(['CONFIRM_DUPLICATE', 'KEEP_BOTH'])
  decision!: 'CONFIRM_DUPLICATE' | 'KEEP_BOTH';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  note?: string;
}
