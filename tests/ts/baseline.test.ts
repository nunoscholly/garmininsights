import { describe, expect, test } from "vitest";
import { baselineOf, deltaOf, trendDirection } from "../../lib/insights/baseline";

describe("baselineOf", () => {
  test("mean of non-null values", () => {
    expect(baselineOf([50, 60, 70])).toBe(60);
  });
  test("ignores null/undefined entries", () => {
    expect(baselineOf([50, null, 60, undefined, 70])).toBe(60);
  });
  test("null when fewer than 3 non-null days (sparse-data rule)", () => {
    expect(baselineOf([50, 60])).toBeNull();
    expect(baselineOf([])).toBeNull();
    expect(baselineOf([null, null, 50, 60])).toBeNull();
  });
});

describe("deltaOf", () => {
  test("signed difference", () => {
    expect(deltaOf(54, 50)).toBe(4);
    expect(deltaOf(48, 50)).toBe(-2);
  });
  test("null when either side is missing", () => {
    expect(deltaOf(null, 50)).toBeNull();
    expect(deltaOf(54, null)).toBeNull();
    expect(deltaOf(undefined, undefined)).toBeNull();
  });
});

describe("trendDirection", () => {
  test("up when last - first exceeds threshold", () => {
    expect(trendDirection([58.0, 58.4, 59.0], 0.5)).toBe("up");
  });
  test("down when below negative threshold", () => {
    expect(trendDirection([59.0, 58.0], 0.5)).toBe("down");
  });
  test("flat within threshold", () => {
    expect(trendDirection([59.0, 59.3], 0.5)).toBe("flat");
  });
  test("null with fewer than 2 non-null values", () => {
    expect(trendDirection([59.0], 0.5)).toBeNull();
    expect(trendDirection([null, null], 0.5)).toBeNull();
  });
  test("skips nulls when picking endpoints", () => {
    expect(trendDirection([null, 58.0, null, 59.0, null], 0.5)).toBe("up");
  });
});
