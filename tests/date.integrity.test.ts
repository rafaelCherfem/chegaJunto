import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCalendarDate,
  assertRecordDate,
  assertReferenceMonth,
  compareCalendarDates,
  competenceFromDate,
  currentMonthStart,
  formatDateDisplay,
  formatMonthLabel,
  isCalendarDate,
  monthBounds,
  nextMonth,
  previousMonth,
  todayISODate,
} from "@/utils/date";
import { receivedRideSchema } from "@/schemas/receivedRide.schema";
afterEach(() => vi.useRealTimers());
describe("civil dates and Sao Paulo business day", () => {
  it.each([
    "2026-02-29",
    "2024-02-30",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "0000-01-01",
    "2026-1-01",
    "2026-01-1",
    "2026-01-01T00:00:00Z",
    "",
    "invalid",
    "2026-01-01\n",
    " 2026-01-01",
    "2026-01-01 ",
  ])("rejects invalid/noncanonical %s", (date) => {
    expect(isCalendarDate(date)).toBe(false);
    expect(() => assertCalendarDate(date)).toThrow();
  });
  it.each(["2024-02-29", "2000-02-29", "2026-02-28", "0001-01-01", "9999-12-31"])(
    "accepts valid Gregorian %s",
    (date) => expect(isCalendarDate(date)).toBe(true),
  );
  it.each([
    ["2026-10-01T02:59:59Z", "2026-09-30"],
    ["2026-10-01T03:00:00Z", "2026-10-01"],
    ["2027-01-01T02:59:59Z", "2026-12-31"],
    ["2027-01-01T03:00:00Z", "2027-01-01"],
    ["2024-03-01T02:59:59Z", "2024-02-29"],
  ])("instant %s maps to Sao Paulo date %s", (instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    expect(todayISODate()).toBe(expected);
    expect(currentMonthStart()).toBe(reference(expected));
  });
  it.each([
    ["2026-01-31", "2026-01-01", "2026-02-01"],
    ["2026-02-28", "2026-02-01", "2026-03-01"],
    ["2024-02-29", "2024-02-01", "2024-03-01"],
    ["2026-12-31", "2026-12-01", "2027-01-01"],
    ["2027-01-01", "2027-01-01", "2027-02-01"],
  ])("%s has civil half-open month bounds", (date, start, end) => {
    expect(competenceFromDate(date)).toBe(start.slice(0, 7));
    expect(monthBounds(reference(date))).toEqual({ start, end });
    expect(nextMonth(start)).toBe(end);
    expect(previousMonth(end)).toBe(start);
    expect(formatDateDisplay(date)).toBe(
      date.slice(8) + "/" + date.slice(5, 7) + "/" + date.slice(0, 4),
    );
  });
  it("compares civil dates without UTC conversion", () => {
    expect(compareCalendarDates("2026-01-31", "2026-02-01")).toBe(-1);
    expect(compareCalendarDates("2026-02-01", "2026-02-01")).toBe(0);
    expect(compareCalendarDates("2027-01-01", "2026-12-31")).toBe(1);
    expect(formatMonthLabel("2026-10-01")).toBe("outubro de 2026");
  });
  it.each(["2026-02", "2026-02-02", "2026-13-01"])(
    "requires canonical competence %s",
    (month) => expect(() => assertReferenceMonth(month)).toThrow(),
  );
  it("accepts today/retroactive and rejects tomorrow including form schema", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T02:00:00Z"));
    for (const date of ["2026-09-30", "2026-09-29", "2024-02-29"]) {
      expect(() => assertRecordDate(date)).not.toThrow();
      expect(
        receivedRideSchema.safeParse({ passengerId: "P", receivedDate: date, amount: 10 })
          .success,
      ).toBe(true);
    }
    expect(() => assertRecordDate("2026-10-01")).toThrow("data futura");
    expect(
      receivedRideSchema.safeParse({
        passengerId: "P",
        receivedDate: "2026-10-01",
        amount: 10,
      }).success,
    ).toBe(false);
  });
});
function reference(date: string) {
  return date.slice(0, 7) + "-01";
}
