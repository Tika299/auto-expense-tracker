import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class QueryReportDto {
  @IsOptional()
  @IsUUID()
  walletId?: string;

  /**
   * Thời điểm bắt đầu, có tính thời điểm này.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /**
   * Thời điểm kết thúc, không tính thời điểm này.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
