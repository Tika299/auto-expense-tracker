import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryCategoryDto {
  @IsOptional()
  @IsIn(['IN', 'OUT', 'BOTH'])
  scope?: 'IN' | 'OUT' | 'BOTH';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean = false;
}
