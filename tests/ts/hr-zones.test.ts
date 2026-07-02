import { describe, expect, test } from "vitest";
import { hrZonesFromRawSummary } from "../../lib/insights/hr-zones";

// shape verified against live /activitylist-service payload 2026-07-02
const REAL = {
  activityId: 123,
  averageHR: 142.0,
  hrTimeInZone_1: 83.387,
  hrTimeInZone_2: 439.026,
  hrTimeInZone_3: 1206.138,
  hrTimeInZone_4: 7.0,
  hrTimeInZone_5: 0.0,
};

describe("hrZonesFromRawSummary", () => {
  test("extracts the five zones in order", () => {
    expect(hrZonesFromRawSummary(REAL)).toEqual([83.387, 439.026, 1206.138, 7.0, 0.0]);
  });
  test("missing keys default to 0", () => {
    expect(hrZonesFromRawSummary({ hrTimeInZone_3: 600 })).toEqual([0, 0, 600, 0, 0]);
  });
  test("null when all zones are zero or absent (degrade to nothing)", () => {
    expect(hrZonesFromRawSummary({ activityId: 1 })).toBeNull();
    expect(hrZonesFromRawSummary({ hrTimeInZone_1: 0, hrTimeInZone_2: 0 })).toBeNull();
  });
  test("null for non-object input", () => {
    expect(hrZonesFromRawSummary(null)).toBeNull();
    expect(hrZonesFromRawSummary("junk")).toBeNull();
  });
  test("non-numeric values treated as 0 (defensive against malformed rows)", () => {
    expect(hrZonesFromRawSummary({ hrTimeInZone_1: "bad", hrTimeInZone_2: 60 })).toEqual([0, 60, 0, 0, 0]);
  });
});
