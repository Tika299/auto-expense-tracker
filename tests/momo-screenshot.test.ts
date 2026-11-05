import screenshotFixtures from "../fixtures/momo-screenshot-samples.json";
import { parseTransaction } from "../backend/src/parser/parser";
import { ParseInput, ParsedTransaction } from "../backend/src/parser/types";

type ScreenshotFixture = {
  id: string;
  origin:
    | "anonymized_real_momo_notification"
    | "anonymized_transcription_from_real_momo_receipt";
  input: ParseInput;
  expected: ParsedTransaction;
};

const fixtures = screenshotFixtures as ScreenshotFixture[];

describe.each(fixtures)("$id", ({ input, expected }) => {
  test("parse đúng mẫu MoMo thực tế đã ẩn danh", () => {
    expect(parseTransaction(input)).toEqual(expected);
  });
});
