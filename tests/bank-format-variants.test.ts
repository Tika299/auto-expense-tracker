import mbbankEmails from "../fixtures/mbbank-email-samples.json";
import mbbankNotifications from "../fixtures/mbbank-samples.json";
import vietcombankEmails from "../fixtures/vietcombank-email-samples.json";
import vietcombankNotifications from "../fixtures/vietcombank-samples.json";
import { parseTransaction } from "../backend/src/parser/parser";
import { ParseInput, ParsedTransaction } from "../backend/src/parser/types";

type BankFixture = {
  id: string;
  input: ParseInput;
  expected: ParsedTransaction;
};

const variants = [
  ...(vietcombankNotifications as BankFixture[]),
  ...(vietcombankEmails as BankFixture[]),
  ...(mbbankNotifications as BankFixture[]),
  ...(mbbankEmails as BankFixture[]),
];

describe.each(variants)("$id", ({ input, expected }) => {
  test("parse đúng biến thể thông báo hoặc email", () => {
    expect(parseTransaction(input)).toEqual(expected);
  });
});
