import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryPendingReviewDto {
  @IsOptional()
  @IsIn(['POSSIBLE_DUPLICATE', 'INTERNAL_TRANSFER'])
  linkType?: 'POSSIBLE_DUPLICATE' | 'INTERNAL_TRANSFER';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
