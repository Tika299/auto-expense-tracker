import { parseTransaction } from "../backend/src/parser/parser";
import { ParseInput, ParsedTransaction } from "../backend/src/parser/types";

type Case = {
  name: string;
  input: ParseInput;
  expected: ParsedTransaction;
};

const cases: Case[] = [
  {
    name: "VCB notification OUT lấy số tiền có dấu, không lấy nhầm số dư",
    input: {
      source: "VIETCOMBANK",
      channel: "ANDROID_NOTIFICATION",
      rawText:
        "Số dư TK VCB 9000000001 -106,000 VND lúc 27-10-2026 18:47:46. Số dư 2,500,000 VND. Ref Ecom.EW26102700000001.MOMO.0900000001.CashIn.SYNTHETIC",
      observedAt: "2026-10-27T18:47:50+07:00",
    },
    expected: {
      amount: 106000,
      direction: "OUT",
      transaction_time: "2026-10-27T18:47:46+07:00",
      reference_code: "Ecom.EW26102700000001",
      merchant_name: "MOMO",
      counterparty_account: null,
      parser_rule: "vcb-notification-v1",
    },
  },
  {
    name: "VCB email OUT đọc biên lai chuyển tiền",
    input: {
      source: "VIETCOMBANK",
      channel: "EMAIL",
      rawText:
        "Biên lai chuyển tiền qua tài khoản (Payment Receipt)\nNgày, giờ giao dịch Trans. Date, Time: 10:51 Thứ Tư 14/10/2026\nSố lệnh giao dịch Order Number: 90000000001\nTài khoản nguồn Debit Account: 9000000001\nTên người chuyển tiền Remitter’s name: NGUYEN VAN A\nTài khoản người hưởng Credit Account: 9000000002\nTên người hưởng Beneficiary Name: NGUYEN VAN B\nTên ngân hàng hưởng Beneficiary Bank Name: Ngân hàng Kỹ thương Việt Nam\nSố tiền Amount: 40,000 VND\nNội dung chuyển tiền Details of Payment: Synthetic transfer",
      observedAt: "2026-10-14T10:51:43+07:00",
    },
    expected: {
      amount: 40000,
      direction: "OUT",
      transaction_time: "2026-10-14T10:51:00+07:00",
      reference_code: "90000000001",
      merchant_name: "NGUYEN VAN B",
      counterparty_account: "9000000002",
      parser_rule: "vcb-email-v1",
    },
  },
  {
    name: "Techcombank OUT có đầy đủ trường",
    input: {
      source: "TECHCOMBANK",
      channel: "ANDROID_NOTIFICATION",
      rawText:
        "Techcombank: TK 9000000002 -275.000 VND ngày 30/10/2026 11:22:33. Số dư 9.999.999 VND. Người nhận: CUA HANG ABC. Mã tham chiếu: FT26303ABC",
      observedAt: "2026-10-30T11:22:40+07:00",
    },
    expected: {
      amount: 275000,
      direction: "OUT",
      transaction_time: "2026-10-30T11:22:33+07:00",
      reference_code: "FT26303ABC",
      merchant_name: "CUA HANG ABC",
      counterparty_account: null,
      parser_rule: "techcombank-v1",
    },
  },
  {
    name: "Techcombank IN fallback observedAt",
    input: {
      source: "TECHCOMBANK",
      channel: "EMAIL",
      rawText:
        "Techcombank thông báo tài khoản 9000000002 +2,000,000 VND. Nội dung giao dịch: NGUYEN VAN A CHUYEN TIEN",
      observedAt: "2026-10-30T12:10:00+07:00",
    },
    expected: {
      amount: 2000000,
      direction: "IN",
      transaction_time: "2026-10-30T12:10:00+07:00",
      reference_code: null,
      merchant_name: "NGUYEN VAN A CHUYEN TIEN",
      counterparty_account: null,
      parser_rule: "techcombank-v1",
    },
  },
  {
    name: "MoMo OUT dựa trên từ khóa đã thanh toán",
    input: {
      source: "MOMO",
      channel: "ANDROID_NOTIFICATION",
      rawText:
        "Bạn đã thanh toán 89.000đ cho CUA HANG XYZ lúc 18:15 30/10/2026. Mã giao dịch: 123456789012",
      observedAt: "2026-10-30T18:15:10+07:00",
    },
    expected: {
      amount: 89000,
      direction: "OUT",
      transaction_time: "2026-10-30T18:15:00+07:00",
      reference_code: "123456789012",
      merchant_name: "CUA HANG XYZ",
      counterparty_account: null,
      parser_rule: "momo-v1",
    },
  },
  {
    name: "MoMo IN dựa trên từ khóa nhận được và fallback observedAt",
    input: {
      source: "MOMO",
      channel: "ANDROID_NOTIFICATION",
      rawText: "Bạn nhận được 500.000đ từ NGUYEN VAN B",
      observedAt: "2026-10-30T19:20:30+07:00",
    },
    expected: {
      amount: 500000,
      direction: "IN",
      transaction_time: "2026-10-30T19:20:30+07:00",
      reference_code: null,
      merchant_name: "NGUYEN VAN B",
      counterparty_account: null,
      parser_rule: "momo-v1",
    },
  },
];

describe.each(cases)("$name", ({ input, expected }) => {
  test("bóc tách đúng giao dịch", () => {
    expect(parseTransaction(input)).toEqual(expected);
  });
});

test.each([
  ["quảng cáo", "MoMo tặng bạn voucher trị giá 500.000đ"],
  ["OTP", "Mã OTP 123456 dùng để xác nhận giao dịch 500.000đ. Không cung cấp cho người khác."],
  ["bảo trì", "MoMo đang bảo trì hệ thống giao dịch 500.000đ. Vui lòng thử lại sau."],
])("không nhận nhầm tin %s thành giao dịch", (_name, rawText) => {
  expect(() =>
    parseTransaction({
      source: "MOMO",
      channel: "ANDROID_NOTIFICATION",
      rawText,
      observedAt: "2026-10-30T20:00:00+07:00",
    }),
  ).toThrow("UNSUPPORTED_FORMAT");
});
