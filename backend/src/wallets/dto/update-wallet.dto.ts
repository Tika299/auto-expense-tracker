import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { WALLET_TYPES, type WalletType } from './create-wallet.dto';

export class UpdateWalletDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100, { message: 'Tên ví phải từ 1 đến 100 ký tự' })
  name?: string;

  @IsOptional()
  @IsEnum(WALLET_TYPES, {
    message: 'Loại ví phải là BANK, EWALLET hoặc CASH',
  })
  type?: WalletType;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
