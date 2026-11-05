import { parseVnd, toIso8601 } from '../helpers';
import {
  ParseError,
  ParseInput,
  ParsedTransaction,
  ParserRule,
} from '../types';

const MB_ACCOUNT_REGEX =
  /(?:^|\n)TK\s+[0-9xX]+\|GD:\s*(?<sign>[+-])(?<amount>\d{1,3}(?:[.,]\d{3})*|\d+)\s*VND\s+(?<day>\d{2})\/(?<month>\d{2})\/(?<shortYear>\d{2})\s+(?<hour>\d{2}):(?<minute>\d{2})\s*\|SD:\s*[\d.,]+\s*VND(?:\|DEN:\s*(?<den>[^|]+))?\|ND:\s*(?<nd>.+)$/iu;

const MB_CARD_REGEX =
  /MB\s*\[[^\]]+\]:SD THE\s*\[[^\]]+\]\s*\nNgày GD:\s*\[(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})\s+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})\]\s*\nSố tiền GD:\s*(?<sign>[+-])(?<amount>\d{1,3}(?:[.,]\d{3})*|\d+)\s*VND\s*\nTKTT:\s*\d+\s*\nNội dung GD:\s*Giao dịch chi tiêu tại\s+(?<merchant>.+)$/iu;

const MB_EMAIL_REGEX =
  /Ngày,\s*giờ giao dịch[:\s]+(?<day>\d{2})-(?<month>\d{2})-(?<year>\d{4})\s+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})[\s\S]*?Số tham chiếu[:\s]+(?<ref>[A-Z0-9]+)[\s\S]*?Tài khoản trích nợ[:\s]+[^\n]+[\s\S]*?Người thụ hưởng[:\s]+(?<beneficiary>[^\n]+)[\s\S]*?Số tiền giao dịch[:\s]+\(VND\)\s*(?<amount>[\d.,]+)[\s\S]*?Tình trạng[:\s]+Giao dịch thành công/iu;

function parseMbDetails(
  den?: string,
  nd?: string,
): {
  reference_code: string | null;
  merchant_name: string | null;
} {
  if (den) {
    const parts = den.split(' - ');
    if (parts.length >= 2) {
      return {
        merchant_name: parts[0].trim(),
        reference_code: parts.slice(1).join(' - ').trim(),
      };
    }
    return { merchant_name: den.trim(), reference_code: null };
  }

  if (nd) {
    const ghtk = nd.match(
      /^Giaohangtietkiem\s+chuyen\s+tien\s+CoD\b.*?\b(?<ref>BC\d+)\b/iu,
    );
    if (ghtk?.groups) {
      return {
        reference_code: ghtk.groups.ref,
        merchant_name: 'GIAOHANGTIETKIEM',
      };
    }

    const momo = nd.match(
      /^(?<ref>\d+)-.+?chuyen tien qua (?<merchant>MoMo)/iu,
    );
    if (momo?.groups) {
      return {
        reference_code: momo.groups.ref,
        merchant_name: momo.groups.merchant.toUpperCase(),
      };
    }
  }

  return { reference_code: null, merchant_name: null };
}

export const mbbankNotificationV1: ParserRule = {
  id: 'mbbank-notification-v1',
  source: 'MBBANK',
  channel: 'ANDROID_NOTIFICATION',
  matches: (text) => MB_ACCOUNT_REGEX.test(text),
  parse(_input: ParseInput, text: string): ParsedTransaction {
    const match = text.match(MB_ACCOUNT_REGEX);
    if (!match?.groups) {
      throw new ParseError('MBBANK_NOTIFICATION_FORMAT_MISMATCH');
    }

    const { sign, amount, day, month, shortYear, hour, minute, den, nd } =
      match.groups;
    const details = parseMbDetails(den, nd);

    return {
      amount: parseVnd(amount),
      direction: sign === '+' ? 'IN' : 'OUT',
      transaction_time: toIso8601({
        year: `20${shortYear}`,
        month,
        day,
        hour,
        minute,
        second: '00',
      }),
      ...details,
      parser_rule: 'mbbank-notification-v1',
    };
  },
};

export const mbbankCardV1: ParserRule = {
  id: 'mbbank-card-v1',
  source: 'MBBANK',
  channel: 'ANDROID_NOTIFICATION',
  matches: (text) => MB_CARD_REGEX.test(text),
  parse(_input: ParseInput, text: string): ParsedTransaction {
    const match = text.match(MB_CARD_REGEX);
    if (!match?.groups) {
      throw new ParseError('MBBANK_CARD_FORMAT_MISMATCH');
    }

    const { sign, amount, year, month, day, hour, minute, second, merchant } =
      match.groups;

    return {
      amount: parseVnd(amount),
      direction: sign === '+' ? 'IN' : 'OUT',
      transaction_time: toIso8601({ year, month, day, hour, minute, second }),
      reference_code: null,
      merchant_name: merchant.trim(),
      parser_rule: 'mbbank-card-v1',
    };
  },
};

export const mbbankEmailV1: ParserRule = {
  id: 'mbbank-email-v1',
  source: 'MBBANK',
  channel: 'EMAIL',
  matches: (text) => MB_EMAIL_REGEX.test(text),
  parse(_input: ParseInput, text: string): ParsedTransaction {
    const match = text.match(MB_EMAIL_REGEX);
    if (!match?.groups) {
      throw new ParseError('MBBANK_EMAIL_FORMAT_MISMATCH');
    }

    const { day, month, year, hour, minute, second, ref, beneficiary, amount } =
      match.groups;
    const rawMerchant = beneficiary.split(/\s+-\s+/u)[0].trim();

    return {
      amount: parseVnd(amount),
      direction: 'OUT',
      transaction_time: toIso8601({ year, month, day, hour, minute, second }),
      reference_code: ref.trim(),
      merchant_name: rawMerchant.startsWith('MOMO_') ? 'MOMO' : rawMerchant,
      parser_rule: 'mbbank-email-v1',
    };
  },
};
