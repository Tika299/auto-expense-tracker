import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateObservationDto {
  @IsUUID()
  walletId!: string;

  @IsIn(['VIETCOMBANK', 'MBBANK', 'MOMO'])
  source!: 'VIETCOMBANK' | 'MBBANK' | 'MOMO';

  @IsIn(['ANDROID_NOTIFICATION', 'EMAIL'])
  channel!: 'ANDROID_NOTIFICATION' | 'EMAIL';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed || null;
  })
  @IsString()
  @MaxLength(500)
  sourceMessageId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  rawText!: string;

  @IsObject()
  rawPayload!: Record<string, unknown>;

  @IsISO8601({ strict: true })
  observedAt!: string;
}
