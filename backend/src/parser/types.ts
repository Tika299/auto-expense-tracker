export type ParseInput = {
  source: 'VIETCOMBANK' | 'TECHCOMBANK' | 'MBBANK' | 'MOMO';
  channel: 'ANDROID_NOTIFICATION' | 'EMAIL';
  rawText: string;
  observedAt: string; // ISO 8601, thời điểm hệ thống nhận thông báo
};

export type ParsedTransaction = {
  amount: number; // số nguyên dương, luôn dương
  direction: 'IN' | 'OUT';
  transaction_time: string; // chuẩn ISO 8601 kèm múi giờ +07:00
  reference_code: string | null;
  merchant_name: string | null;
  parser_rule: string; // định danh Regex/Rule đã sử dụng
};

export type ParserRule = {
  id: string;
  source: ParseInput['source'];
  channel?: ParseInput['channel'];
  matches(text: string): boolean;
  parse(input: ParseInput, text: string): ParsedTransaction;
};

export class ParseError extends Error {
  constructor(
    public code: string,
    public details?: any,
  ) {
    super(`ParseError: ${code}`);
    this.name = 'ParseError';
  }
}
