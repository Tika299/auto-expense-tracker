import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCategorizationRuleDto {
  @IsUUID()
  categoryId!: string;

  @IsIn(['MERCHANT_NAME', 'COUNTERPARTY_ACCOUNT'])
  matchField!: 'MERCHANT_NAME' | 'COUNTERPARTY_ACCOUNT';

  @IsIn(['EXACT', 'CONTAINS'])
  operator!: 'EXACT' | 'CONTAINS';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  pattern!: string;

  /**
   * Số càng nhỏ thì ưu tiên càng cao.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  priority?: number = 100;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
