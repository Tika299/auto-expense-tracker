import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  name!: string;

  @IsOptional()
  @IsIn(['IN', 'OUT', 'BOTH'])
  scope?: 'IN' | 'OUT' | 'BOTH' = 'BOTH';

  @IsOptional()
  @IsString()
  @Length(1, 50)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{6})$/, {
    message: 'color must be a valid hex color code (e.g., #FF5733)',
  })
  color?: string;
}
