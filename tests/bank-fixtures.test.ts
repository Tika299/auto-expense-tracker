import transactionsFixtures from "../fixtures/transactions.json";
import { parseTransaction } from "../backend/src/parser/parser";
import { ParseInput, ParsedTransaction } from "../backend/src/parser/types";

type BankFixture = {
  id: string;
  input: ParseInput;
  expected: ParsedTransaction;
};

const fixtures = transactionsFixtures as BankFixture[];

test("bộ dữ liệu có đúng 24 mẫu và mỗi nguồn có 4 IN + 4 OUT", () => {
  expect(fixtures).toHaveLength(24);

  for (const source of ["VIETCOMBANK", "MBBANK", "MOMO"] as const) {
    const sourceFixtures = fixtures.filter(
      (fixture) => fixture.input.source === source,
    );

    expect(sourceFixtures).toHaveLength(8);
    expect(
      sourceFixtures.filter((fixture) => fixture.expected.direction === "IN"),
    ).toHaveLength(4);
    expect(
      sourceFixtures.filter((fixture) => fixture.expected.direction === "OUT"),
    ).toHaveLength(4);

    if (source !== "MOMO") {
      expect(
        new Set(sourceFixtures.map((fixture) => fixture.input.channel)),
      ).toEqual(new Set(["ANDROID_NOTIFICATION", "EMAIL"]));
    }
  }
});

describe.each(fixtures)("$id", ({ input, expected }) => {
  test("parse đúng fixture giao dịch đã ẩn danh", () => {
    expect(parseTransaction(input)).toEqual(expected);
  });
});
