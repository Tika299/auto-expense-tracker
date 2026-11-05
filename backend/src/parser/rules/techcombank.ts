import {
  cleanCapturedValue,
  directionFromSign,
  parseTransactionTime,
  parseVnd,
} from '../helpers';
import { ParseError, ParsedTransaction, ParserRule } from '../types';

const SIGNED_AMOUNT =
  /(?<sign>[+-])\s*(?<amount>\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?|\d+)\s*(?:VND|VNĐ|đ)/iu;

const REFERENCE_PATTERNS = [
  /(?:mã\s*(?:giao dịch|gd|tham chiếu)|reference|ref(?:erence)?)[\s:#-]*(?<value>[A-Z0-9_-]+)/iu,
  /(?:transaction\s*id)[\s:#-]*(?<value>[A-Z0-9_-]+)/iu,
];

const MERCHANT_PATTERNS = [
  /(?:tên\s*(?:người\s*thụ\s*hưởng|người\s*nhận)|người\s*nhận|người\s*gửi|merchant)\s*:\s*(?<value>.+?)(?=\n|\.|;|$)/iu,
  /(?:nội\s*dung(?:\s*giao\s*dịch)?|nd)\s*:\s*(?<value>.+?)(?=\s+(?:mã\s*(?:giao\s*dịch|gd|tham\s*chiếu)|số\s*dư|ref)\s*[:#-]|\n|$)/iu,
];

function firstValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = cleanCapturedValue(text.match(pattern)?.groups?.value);
    if (value) return value;
  }
  return null;
}

function parseTechcombank(text: string, observedAt: string): ParsedTransaction {
  const amountMatch = text.match(SIGNED_AMOUNT);
  if (!amountMatch?.groups) {
    throw new ParseError('TCB_SIGNED_AMOUNT_NOT_FOUND');
  }

  return {
    amount: parseVnd(amountMatch.groups.amount),
    direction: directionFromSign(amountMatch.groups.sign),
    transaction_time: parseTransactionTime(text, observedAt),
    reference_code: firstValue(text, REFERENCE_PATTERNS),
    merchant_name: firstValue(text, MERCHANT_PATTERNS),
    parser_rule: 'techcombank-v1',
  };
}

export const techcombankRuleV1: ParserRule = {
  id: 'techcombank-v1',
  source: 'TECHCOMBANK',
  matches: (text) => SIGNED_AMOUNT.test(text),
  parse: (input, text) => parseTechcombank(text, input.observedAt),
};
