import { parseVnd, toIso8601 } from '../helpers';
import {
  ParseError,
  ParseInput,
  ParsedTransaction,
  ParserRule,
} from '../types';

const VCB_NOTIFICATION_REGEX =
  /^Số dư TK VCB\s+\d+\s+(?<sign>[+-])(?<amount>\d{1,3}(?:[.,]\d{3})*|\d+)\s*VND\s+lúc\s+(?<day>\d{2})-(?<month>\d{2})-(?<year>\d{4})\s+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})\.\s*Số dư\s+[\d.,]+\s*VND\.\s*Ref\s+(?<refRaw>.+)$/iu;

const VCB_EMAIL_REGEX =
  /Ngày,\s*giờ giao dịch(?:\s*Trans\.\s*Date,\s*Time)?[:\s]+(?<hour>\d{1,2}):(?<minute>\d{2})\s+(?:Thứ\s+[^\d]+|Chủ\s+Nhật)\s+(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})[\s\S]*?Số lệnh giao dịch(?:\s*Order Number)?[:\s]+(?<ref>[A-Z0-9]+)[\s\S]*?Tài khoản nguồn(?:\s*Debit Account)?[:\s]+\d+[\s\S]*?Tên người hưởng(?:\s*Beneficiary Name)?[:\s]+(?<merchant>[^\n]+?)\s*(?:\n|Tên ngân hàng hưởng)[\s\S]*?Số tiền(?:\s*Amount)?[:\s]+(?<amount>[\d.,]+)\s*VND/iu;

function parseVcbReference(refRaw: string): {
  reference_code: string | null;
  merchant_name: string | null;
} {
  const ecom = refRaw.match(
    /^(?<ref>Ecom\.[A-Z0-9]+)\.(?<merchant>[A-Z0-9]+)\./iu,
  );
  if (ecom?.groups) {
    return {
      reference_code: ecom.groups.ref,
      merchant_name: ecom.groups.merchant.toUpperCase(),
    };
  }

  const atm = refRaw.match(/^(?<ref>ATM_(?:QR)?CWD\.\d+\.\d+)\./iu);
  if (atm?.groups) {
    return { reference_code: atm.groups.ref, merchant_name: null };
  }

  const mbvcb = refRaw.match(
    /^(?<ref>MBVCB\.\d+\.[A-Z0-9]+)\..*?toi\s+\d+\s+(?<merchant>.+?)\s+tai\s+[A-Z0-9]+$/iu,
  );
  if (mbvcb?.groups) {
    return {
      reference_code: mbvcb.groups.ref,
      merchant_name: mbvcb.groups.merchant.trim(),
    };
  }

  const partner = refRaw.match(
    /^(?<ref>PARTNER\.DIRECT_DEBITS_VCB\.[A-Z]+\.\d+)\..*?(?<merchant>MoMo)$/iu,
  );
  if (partner?.groups) {
    return {
      reference_code: partner.groups.ref,
      merchant_name: partner.groups.merchant.toUpperCase(),
    };
  }

  const napasIn = refRaw.match(
    /^(?<ref>[A-Z0-9]+)\..*\.\d{8}\.\d{6}\.\d+\.(?:VND-TGTT-)?(?<merchant>[^.]+)\.\d{6}$/iu,
  );
  if (napasIn?.groups) {
    return {
      reference_code: napasIn.groups.ref,
      merchant_name: napasIn.groups.merchant.trim(),
    };
  }

  return {
    reference_code: refRaw.split('.')[0]?.trim() || null,
    merchant_name: null,
  };
}

export const vcbNotificationV1: ParserRule = {
  id: 'vcb-notification-v1',
  source: 'VIETCOMBANK',
  channel: 'ANDROID_NOTIFICATION',
  matches: (text) => VCB_NOTIFICATION_REGEX.test(text),
  parse(_input: ParseInput, text: string): ParsedTransaction {
    const match = text.match(VCB_NOTIFICATION_REGEX);
    if (!match?.groups) {
      throw new ParseError('VCB_NOTIFICATION_FORMAT_MISMATCH');
    }

    const { sign, amount, day, month, year, hour, minute, second, refRaw } =
      match.groups;
    const details = parseVcbReference(refRaw.trim());

    return {
      amount: parseVnd(amount),
      direction: sign === '+' ? 'IN' : 'OUT',
      transaction_time: toIso8601({ year, month, day, hour, minute, second }),
      ...details,
      parser_rule: 'vcb-notification-v1',
    };
  },
};

export const vcbEmailV1: ParserRule = {
  id: 'vcb-email-v1',
  source: 'VIETCOMBANK',
  channel: 'EMAIL',
  matches: (text) => VCB_EMAIL_REGEX.test(text),
  parse(_input: ParseInput, text: string): ParsedTransaction {
    const match = text.match(VCB_EMAIL_REGEX);
    if (!match?.groups) {
      throw new ParseError('VCB_EMAIL_FORMAT_MISMATCH');
    }

    const { hour, minute, day, month, year, ref, merchant, amount } =
      match.groups;

    return {
      amount: parseVnd(amount),
      direction: 'OUT',
      transaction_time: toIso8601({
        year,
        month,
        day,
        hour,
        minute,
        second: '00',
      }),
      reference_code: ref.trim(),
      merchant_name: merchant.trim(),
      parser_rule: 'vcb-email-v1',
    };
  },
};
