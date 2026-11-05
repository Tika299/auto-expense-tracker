import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export const WALLET_TYPES = ['BANK', 'EWALLET', 'CASH'] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export class CreateWalletDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100, { message: 'Tên ví phải từ 1 đến 100 ký tự' })
  name!: string;

  @IsEnum(WALLET_TYPES, {
    message: 'Loại ví phải là BANK, EWALLET hoặc CASH',
  })
  type!: WalletType;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsString()
  @Length(3, 10)
  currency?: string;
}
