import { ParseInput, ParsedTransaction, ParseError } from './types';
import { normalizeText } from './normalize';
import { vcbNotificationV1, vcbEmailV1 } from './rules/vietcombank';
import { techcombankRuleV1 } from './rules/techcombank';
import {
  mbbankCardV1,
  mbbankEmailV1,
  mbbankNotificationV1,
} from './rules/mbbank';
import { momoReceiptV1, momoRuleV1 } from './rules/momo';

// Đăng ký toàn bộ các Rule đã viết
const RULES = [
  vcbEmailV1,
  vcbNotificationV1,
  techcombankRuleV1,
  mbbankEmailV1,
  mbbankNotificationV1,
  mbbankCardV1,
  momoReceiptV1,
  momoRuleV1,
];

export function parseTransaction(input: ParseInput): ParsedTransaction {
  const text = normalizeText(input.rawText);

  // Lọc các rule phù hợp với source và channel
  const candidates = RULES.filter(
    (rule) =>
      rule.source === input.source &&
      (!rule.channel || rule.channel === input.channel) &&
      rule.matches(text),
  );

  // Thử lần lượt từng rule (từ cụ thể đến tổng quát)
  for (const rule of candidates) {
    try {
      return rule.parse(input, text);
    } catch {
      // Nếu rule này lỗi match ngầm, tiếp tục thử rule khác cùng nguồn
    }
  }

  throw new ParseError('UNSUPPORTED_FORMAT', {
    source: input.source,
    channel: input.channel,
  });
}
