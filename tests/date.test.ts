import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentMonthStart,
  formatDateDisplay,
  nextMonth,
  previousMonth,
  referenceMonthFromDate,
  todayISODate,
} from "@/utils/date";

afterEach(() => vi.useRealTimers());
describe("calendar helpers — current baseline", () => {
  it.each([
    ["2026-01-31", "2026-01-01"],
    ["2026-02-28", "2026-02-01"],
    ["2024-02-29", "2024-02-01"],
    ["2026-12-31", "2026-12-01"],
    ["2025-10-15", "2025-10-01"],
    ["2026-10-01", "2026-10-01"],
  ])("%s belongs to %s", (date, month) => {
    expect(referenceMonthFromDate(date)).toBe(month);
  });
  it("formats a date without turning it into a UTC instant", () => {
    expect(formatDateDisplay("2024-02-29")).toBe("29/02/2024");
  });
  it("advances December into January of the next year", () => {
    expect(nextMonth("2026-12-01")).toBe("2027-01-01");
  });
  it("moves January into December of the previous year", () => {
    expect(previousMonth("2026-01-01")).toBe("2025-12-01");
  });
  it("keeps February navigation correct in a leap year", () => {
    expect(nextMonth("2024-02-01")).toBe("2024-03-01");
    expect(previousMonth("2024-03-01")).toBe("2024-02-01");
  });
  it("uses the business calendar for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    expect(todayISODate()).toBe("2026-10-01");
    expect(currentMonthStart()).toBe("2026-10-01");
    expect(referenceMonthFromDate(todayISODate())).toBe("2026-10-01");
  });
});
