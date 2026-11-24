import { describe, expect, it } from "vitest";
import { hasWholeMonthLastCharge, isWholeMonthPeriod } from "@/utils/cycles";
import type { MonthlyCharge } from "@/types/entities";

const charge = (passengerId: string, periodStart: string, periodEnd: string): MonthlyCharge => ({
  id: `${passengerId}-${periodStart}-${periodEnd}`,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  totalAmount: 10,
  paid: false,
  paidAmount: 0,
  revision: 1,
  activePaymentId: null,
  paidAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  extensible: false,
});

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

describe("whole-month last charge", () => {
  it("blocks when the last charge is a whole month", () => {
    expect(hasWholeMonthLastCharge([charge("a", "2026-11-01", "2026-11-30")])).toBe(true);
  });

  it("does not block when the last charge has another format (07/12 to 06/01)", () => {
    expect(hasWholeMonthLastCharge([charge("a", "2026-12-07", "2027-01-06")])).toBe(false);
  });

  it("only the last charge counts: a whole October before a different November does not block", () => {
    const charges = [charge("a", "2026-10-01", "2026-10-31"), charge("a", "2026-11-01", "2026-11-25")];
    expect(hasWholeMonthLastCharge(charges)).toBe(false);
    expect(hasWholeMonthLastCharge([...charges].reverse())).toBe(false);
  });

  it("a whole month that is the last still blocks, in any order", () => {
    const charges = [charge("a", "2026-11-01", "2026-11-30"), charge("a", "2026-10-01", "2026-10-31")];
    expect(hasWholeMonthLastCharge(charges)).toBe(true);
    expect(hasWholeMonthLastCharge([...charges].reverse())).toBe(true);
  });

  it("does not block without charges", () => {
    expect(hasWholeMonthLastCharge([])).toBe(false);
  });

  it("one passenger in that state is enough, even if the others are fine", () => {
    const charges = [charge("a", "2026-12-07", "2027-01-06"), charge("b", "2026-11-01", "2026-11-30")];
    expect(hasWholeMonthLastCharge(charges)).toBe(true);
  });

  it("each passenger is judged by their own last charge", () => {
    const charges = [
      charge("a", "2026-10-01", "2026-10-31"),
      charge("a", "2026-11-01", "2026-12-06"),
      charge("b", "2026-10-01", "2026-10-31"),
      charge("b", "2026-11-01", "2026-12-06"),
    ];
    expect(hasWholeMonthLastCharge(charges)).toBe(false);
  });
});
