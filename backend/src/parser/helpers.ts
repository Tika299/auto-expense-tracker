import { ParseError } from './types';

export function parseVnd(value: string): number {
  // Loại bỏ phần thập phân .00 hoặc ,00 ở cuối số tiền (ví dụ: "1,822,540.00" -> "1,822,540")
  const withoutDecimals = value
    .trim()
    .replace(/[.,]00(?=\s*(?:VND|VNĐ|đ|$))/iu, '');
  const digits = withoutDecimals.replace(/[^\d]/g, '');

  if (!digits) {
    throw new ParseError('INVALID_VND_AMOUNT', { value });
  }

  const amount = Number(digits);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ParseError('UNSAFE_VND_AMOUNT', { value });
  }

  return amount;
}

export function cleanAccount(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return normalized.length >= 6 ? normalized : null;
}

export function toIso8601(dateParts: {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second?: string;
}): string {
  const year = dateParts.year.padStart(4, '0');
  const month = dateParts.month.padStart(2, '0');
  const day = dateParts.day.padStart(2, '0');
  const hour = dateParts.hour.padStart(2, '0');
  const minute = dateParts.minute.padStart(2, '0');
  const second = (dateParts.second ?? '00').padStart(2, '0');

  const values = [month, day, hour, minute, second].map(Number);
  const [monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] =
    values;
  const calendarDate = new Date(
    Date.UTC(
      Number(year),
      monthNumber - 1,
      dayNumber,
      hourNumber,
      minuteNumber,
      secondNumber,
    ),
  );

  const valid =
    calendarDate.getUTCFullYear() === Number(year) &&
    calendarDate.getUTCMonth() === monthNumber - 1 &&
    calendarDate.getUTCDate() === dayNumber &&
    hourNumber >= 0 &&
    hourNumber <= 23 &&
    minuteNumber >= 0 &&
    minuteNumber <= 59 &&
    secondNumber >= 0 &&
    secondNumber <= 59;

  if (!valid) {
    throw new ParseError('INVALID_TRANSACTION_TIME', { dateParts });
  }

  // Các thông báo trong phạm vi ứng dụng sử dụng giờ Việt Nam.
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
}

const DATE_THEN_TIME =
  /(?<day>\d{1,2})[/-](?<month>\d{1,2})[/-](?<year>\d{4})[\s,T]+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?/u;

const TIME_THEN_DATE =
  /(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?[\s,]+(?<day>\d{1,2})[/-](?<month>\d{1,2})[/-](?<year>\d{4})/u;

export function parseTransactionTime(text: string, observedAt: string): string {
  const match = text.match(DATE_THEN_TIME) ?? text.match(TIME_THEN_DATE);

  if (!match?.groups) {
    return observedAt;
  }

  return toIso8601({
    year: match.groups.year,
    month: match.groups.month,
    day: match.groups.day,
    hour: match.groups.hour,
    minute: match.groups.minute,
    second: match.groups.second,
  });
}

export function directionFromSign(sign: string): 'IN' | 'OUT' {
  if (sign === '+') return 'IN';
  if (sign === '-') return 'OUT';
  throw new ParseError('INVALID_TRANSACTION_DIRECTION', { sign });
}

export function cleanCapturedValue(value?: string): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/^[\s:.-]+/u, '')
    .replace(/[\s.;,-]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return cleaned || null;
}
