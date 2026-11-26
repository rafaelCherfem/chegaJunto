import { describe, expect, it } from "vitest";
import { isWholeMonthPeriod } from "@/utils/cycles";

describe("whole-month period", () => {
  it.each([
    ["2026-11-01", "2026-11-30"],
    ["2026-12-01", "2026-12-31"],
    ["2026-10-01", "2026-10-31"],
    ["2027-02-01", "2027-02-28"],
    ["2028-02-01", "2028-02-29"],
  ])("%s a %s is a whole month", (start, end) => {
    expect(isWholeMonthPeriod(start, end)).toBe(true);
  });

  it.each([
    ["2026-12-07", "2027-01-06"],
    ["2026-11-01", "2026-12-06"],
    ["2026-11-01", "2026-11-29"],
    ["2026-11-02", "2026-11-30"],
    ["2026-11-01", "2026-12-31"],
    ["2027-02-01", "2027-02-27"],
    ["2028-02-01", "2028-02-28"],
    ["2026-11-01", "2026-11-01"],
  ])("%s a %s is not a whole month", (start, end) => {
    expect(isWholeMonthPeriod(start, end)).toBe(false);
  });

  it("does not throw on malformed dates", () => {
    expect(isWholeMonthPeriod("", "")).toBe(false);
    expect(isWholeMonthPeriod("2026-11-01", "2026-11-31")).toBe(false);
  });
});
