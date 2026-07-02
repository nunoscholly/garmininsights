import { describe, expect, test } from "vitest";
import { fmtSigned, fmtSignedMin } from "../../lib/format";

describe("fmtSigned", () => {
  test("positive gets explicit plus", () => {
    expect(fmtSigned(4)).toBe("+4");
    expect(fmtSigned(3.7, 1)).toBe("+3.7");
  });
  test("negative keeps minus, zero unsigned", () => {
    expect(fmtSigned(-2)).toBe("-2");
    expect(fmtSigned(0)).toBe("0");
  });
  test("rounds to digits", () => {
    expect(fmtSigned(3.7)).toBe("+4");
  });
});

describe("fmtSignedMin", () => {
  test("minutes only", () => {
    expect(fmtSignedMin(-2280)).toBe("−38m");
  });
  test("hours and minutes", () => {
    expect(fmtSignedMin(3900)).toBe("+1h 5m");
  });
  test("zero", () => {
    expect(fmtSignedMin(0)).toBe("0m");
  });
});
