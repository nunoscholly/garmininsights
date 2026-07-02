import { describe, expect, test } from "vitest";
import { zoneFor, deltaTextClass, STRESS_BANDS } from "../../lib/insights/zones";
import { SLEEP_TARGET_SEC, VO2MAX_TREND_THRESHOLD } from "../../lib/insights/targets";

describe("zoneFor — Garmin band boundaries", () => {
  test("sleep score", () => {
    expect(zoneFor("sleepScore", 92)?.label).toBe("excellent");
    expect(zoneFor("sleepScore", 90)?.label).toBe("excellent");
    expect(zoneFor("sleepScore", 89)?.label).toBe("good");
    expect(zoneFor("sleepScore", 80)?.label).toBe("good");
    expect(zoneFor("sleepScore", 79)?.label).toBe("fair");
    expect(zoneFor("sleepScore", 60)?.label).toBe("fair");
    expect(zoneFor("sleepScore", 59)?.label).toBe("poor");
  });
  test("body battery", () => {
    expect(zoneFor("bodyBattery", 75)?.label).toBe("high");
    expect(zoneFor("bodyBattery", 74)?.label).toBe("medium");
    expect(zoneFor("bodyBattery", 50)?.label).toBe("medium");
    expect(zoneFor("bodyBattery", 49)?.label).toBe("low");
    expect(zoneFor("bodyBattery", 24)?.label).toBe("very low");
  });
  test("stress (low value = best tier)", () => {
    expect(zoneFor("stress", 20)).toEqual({ label: "rest", textClass: "text-lime" });
    expect(zoneFor("stress", 26)?.label).toBe("low");
    expect(zoneFor("stress", 51)?.label).toBe("medium");
    expect(zoneFor("stress", 76)).toEqual({ label: "high", textClass: "text-red" });
  });
  test("tier → color mapping (best lime, worst red)", () => {
    expect(zoneFor("sleepScore", 95)?.textClass).toBe("text-lime");
    expect(zoneFor("sleepScore", 85)?.textClass).toBe("text-warm");
    expect(zoneFor("sleepScore", 70)?.textClass).toBe("text-amber");
    expect(zoneFor("sleepScore", 40)?.textClass).toBe("text-red");
  });
  test("null for missing values", () => {
    expect(zoneFor("sleepScore", null)).toBeNull();
    expect(zoneFor("stress", undefined)).toBeNull();
  });
});

describe("deltaTextClass — goodness direction", () => {
  test("higher-is-good: positive lime, negative red", () => {
    expect(deltaTextClass(6, "higher")).toBe("text-lime");
    expect(deltaTextClass(-6, "higher")).toBe("text-red");
  });
  test("lower-is-good: positive red, negative lime (RHR +4 must be red)", () => {
    expect(deltaTextClass(4, "lower")).toBe("text-red");
    expect(deltaTextClass(-4, "lower")).toBe("text-lime");
  });
  test("neutral and zero are dim", () => {
    expect(deltaTextClass(100, "neutral")).toBe("text-fg-dim");
    expect(deltaTextClass(0, "higher")).toBe("text-fg-dim");
  });
});

describe("constants", () => {
  test("stress bands cover 0–100 in Garmin tiers", () => {
    expect(STRESS_BANDS).toHaveLength(4);
    expect(STRESS_BANDS[0]).toEqual({ from: 0, to: 25, color: "#b6ff39" });
    expect(STRESS_BANDS[3]).toEqual({ from: 75, to: 100, color: "#ff5a5a" });
  });
  test("targets", () => {
    expect(SLEEP_TARGET_SEC).toBe(8 * 3600);
    expect(VO2MAX_TREND_THRESHOLD).toBe(0.5);
  });
});
