import {
  cleanCapturedValue,
  directionFromSign,
  parseTransactionTime,
  parseVnd,
  toIso8601,
} from '../helpers';
import { ParseError, ParsedTransaction, ParserRule } from '../types';

const RECEIPT_HEADER_AMOUNT =
  /^Biên nhận giao dịch\n(?<header>[^\n]+)\n(?<sign>[+-])\s*(?<amount>\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:VND|VNĐ|đ|₫)(?:\n|$)/iu;

const RECEIPT_SUCCESS = /(?:^|\n)Trạng thái\s*(?:\n|:\s*)?Thành công(?:\n|$)/iu;

const RECEIPT_TIME =
  /(?:^|\n)Thời gian\s*(?:\n|:\s*)?(?<hour>\d{1,2}):(?<minute>\d{2})\s*-\s*(?<day>\d{1,2})\/(?<month>\d{1,2})\/(?<year>\d{4})(?:\n|$)/iu;

const RECEIPT_REFERENCE =
  /(?:^|\n)Mã giao dịch\s*(?:\n|:\s*)?(?<value>[A-Z0-9_-]+)(?:\n|$)/iu;

const OUT_ACTION =
  /(?:đã\s+(?:thực\s+hiện\s+)?thanh\s+toán|thanh\s+toán\s+thành\s+công|đã\s+(?:chuyển|giao\s+dịch|rút|nạp)(?:\s+tiền)?\s+thành\s+công)/iu;

const IN_ACTION =
  /(?:nhận\s+được|đã\s+nhận|vừa\s+nhận|nhận\s+chuyển\s+khoản\s+từ)/iu;

const ACTION_AMOUNT =
  /(?:đã\s+(?:thực\s+hiện\s+)?thanh\s+toán|thanh\s+toán\s+thành\s+công|đã\s+chuyển(?:\s+tiền)?|nhận\s+được|đã\s+nhận|vừa\s+nhận)(?:\s+thành\s+công)?\s+(?<amount>\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:VND|VNĐ|đ|₫)/iu;

const LABELED_AMOUNT =
  /(?:(?:với\s+)?số\s*tiền|giá\s*trị)\s*:?[\s]*(?<amount>\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:VND|VNĐ|đ|₫)/iu;

// Thông báo nạp gói của MoMo có thể ghi "mệnh giá 10.000" mà không kèm đơn vị tiền.
const DENOMINATION_AMOUNT =
  /(?:mệnh\s*giá)\s*:?[\s]*(?<amount>\d{1,3}(?:[.,\s]\d{3})+|\d+)(?:\s*(?:VND|VNĐ|đ|₫))?/iu;

const REFERENCE_PATTERNS = [
  /(?:mã\s*(?:giao dịch|gd)|transaction\s*id)[\s:#-]*(?<value>[A-Z0-9_-]+)/iu,
];

const OUT_MERCHANT_PATTERNS = [
  /(?:thanh\s+toán\s+thành\s+công\s+cho)\s+(?<value>.+?)(?=\s+với\s+số\s+tiền|\n|\.|$)/iu,
  /(?:giao\s+dịch|chuyển(?:\s+tiền)?)\s+thành\s+công\s+số\s+tiền\s+[\d.,\s]+\s*(?:VND|VNĐ|đ|₫)\s+đến\s+(?<value>.+?)(?=\s*\([^\r\n)]+\),?\s*(?:số\s+tài\s+khoản|tài\s+khoản)|,?\s*(?:số\s+tài\s+khoản|tài\s+khoản)|\n|\.|$)/iu,
  /(?:nạp\s+gói\s+combo)\s+(?<value>.+?)\s+thành\s+công/iu,
  /(?:cho|tới|đến)\s+(?<value>.+?)(?=\s+(?:lúc|vào\s+lúc|mã\s*(?:giao\s*dịch|gd)|nội\s*dung)\s*[:#-]?|\n|\.|$)/iu,
  /(?:cửa\s*hàng|người\s*nhận|merchant)\s*:\s*(?<value>.+?)(?=\n|\.|;|$)/iu,
  /(?:tài\s+khoản\s+ngân\s+hàng\s+liên\s+kết)\s+(?<value>.+?)(?=\n|\.|;|$)/iu,
];

const IN_MERCHANT_PATTERNS = [
  /(?:nhận\s+chuyển\s+khoản\s+từ)\s+(?<value>.+?)(?=\n|\s+số\s+tiền|$)/iu,
  /(?:từ)\s+(?<value>.+?)(?=\s+(?:lúc|vào\s+lúc|mã\s*(?:giao\s*dịch|gd)|nội\s*dung)\s*[:#-]?|\n|\.|$)/iu,
  /(?:người\s*gửi)\s*:\s*(?<value>.+?)(?=\n|\.|;|$)/iu,
];

function firstValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = cleanCapturedValue(text.match(pattern)?.groups?.value);
    if (value) return value;
  }
  return null;
}

function receiptMerchant(header: string): string | null {
  const transfer = header.match(
    /^(?:THANH TOÁN CHO|CHUYỂN ĐẾN)\s+(?<value>.+?)\s+\([^)]+\)$/iu,
  );
  if (transfer?.groups?.value) {
    return cleanCapturedValue(transfer.groups.value);
  }

  const mobileData = header.match(/^NẠP DATA\s+(?<value>.+)$/iu);
  if (mobileData?.groups?.value) {
    return cleanCapturedValue(mobileData.groups.value);
  }

  return cleanCapturedValue(header);
}

function parseMomoReceipt(text: string): ParsedTransaction {
  const amountMatch = text.match(RECEIPT_HEADER_AMOUNT);
  const timeMatch = text.match(RECEIPT_TIME);

  if (
    !amountMatch?.groups ||
    !timeMatch?.groups ||
    !RECEIPT_SUCCESS.test(text)
  ) {
    throw new ParseError('MOMO_RECEIPT_FORMAT_MISMATCH');
  }

  const reference = text.match(RECEIPT_REFERENCE)?.groups?.value;
  const { header, sign, amount } = amountMatch.groups;
  const { year, month, day, hour, minute } = timeMatch.groups;

  return {
    amount: parseVnd(amount),
    direction: directionFromSign(sign),
    transaction_time: toIso8601({
      year,
      month,
      day,
      hour,
      minute,
      second: '00',
    }),
    reference_code: cleanCapturedValue(reference),
    merchant_name: receiptMerchant(header),
    parser_rule: 'momo-receipt-v1',
  };
}

function parseMomo(text: string, observedAt: string): ParsedTransaction {
  const isOut = OUT_ACTION.test(text);
  const isIn = IN_ACTION.test(text);

  if (isOut === isIn) {
    throw new ParseError('MOMO_DIRECTION_NOT_FOUND');
  }

  const amountMatch =
    text.match(ACTION_AMOUNT) ??
    text.match(LABELED_AMOUNT) ??
    text.match(DENOMINATION_AMOUNT);
  if (!amountMatch?.groups?.amount) {
    throw new ParseError('MOMO_AMOUNT_NOT_FOUND');
  }

  return {
    amount: parseVnd(amountMatch.groups.amount),
    direction: isOut ? 'OUT' : 'IN',
    transaction_time: parseTransactionTime(text, observedAt),
    reference_code: firstValue(text, REFERENCE_PATTERNS),
    merchant_name: firstValue(
      text,
      isOut ? OUT_MERCHANT_PATTERNS : IN_MERCHANT_PATTERNS,
    ),
    parser_rule: 'momo-v1',
  };
}

export const momoRuleV1: ParserRule = {
  id: 'momo-v1',
  source: 'MOMO',
  matches: (text) => OUT_ACTION.test(text) || IN_ACTION.test(text),
  parse: (input, text) => parseMomo(text, input.observedAt),
};

export const momoReceiptV1: ParserRule = {
  id: 'momo-receipt-v1',
  source: 'MOMO',
  channel: 'ANDROID_NOTIFICATION',
  matches: (text) =>
    RECEIPT_HEADER_AMOUNT.test(text) && RECEIPT_SUCCESS.test(text),
  parse: (_input, text) => parseMomoReceipt(text),
};
