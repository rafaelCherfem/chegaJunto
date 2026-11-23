import { describe, expect, it } from "vitest";
import { pendingCents } from "@/utils/chargeState";
import {
  buildOpenCycle,
  groupChargesByPeriodEnd,
  lastClosedEnds,
  mergeById,
  neverClosedPassengerIds,
  openCycleLookback,
  periodTotals,
} from "@/utils/cycles";
import { formatDayMonth, formatPeriodLabel, nextDay } from "@/utils/date";
import type { MonthlyCharge, ReceivedRide, Ride } from "@/types/entities";

const charge = (id: string, passengerId: string, periodStart: string, periodEnd: string): MonthlyCharge => ({
  id,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  revision: 1,
  activePaymentId: null,
  totalAmount: 10,
  paid: false,
  paidAmount: 0,
  paidAt: null,
  createdAt: "",
});
const ride = (id: string, passengerId: string, rideDate: string, rateCharged = 10): Ride => ({
  id,
  passengerId,
  rideDate,
  rateCharged,
  createdAt: "",
});
const received = (id: string, passengerId: string, receivedDate: string, amount: number): ReceivedRide => ({
  id,
  passengerId,
  receivedDate,
  amount,
  createdAt: "",
});

describe("groupChargesByPeriodEnd", () => {
  it("groups by period_end, newest first, with the smallest start as the group start", () => {
    const groups = groupChargesByPeriodEnd([
      charge("a-oct", "A", "2026-10-01", "2026-10-31"),
      charge("a-dec", "A", "2026-11-01", "2026-12-06"),
      charge("b-dec", "B", "2026-11-05", "2026-12-06"),
    ]);
    expect(groups.map((g) => [g.periodEnd, g.periodStart, g.charges.map((c) => c.id)])).toEqual([
      ["2026-12-06", "2026-11-01", ["a-dec", "b-dec"]],
      ["2026-10-31", "2026-10-01", ["a-oct"]],
    ]);
  });

  it("takes the smallest start even when the later passenger comes first", () => {
    const [group] = groupChargesByPeriodEnd([
      charge("b", "B", "2026-11-05", "2026-12-06"),
      charge("a", "A", "2026-11-01", "2026-12-06"),
    ]);
    expect(group?.periodStart).toBe("2026-11-01");
  });

  it("does not mix cycles that start on the same day but end on different days", () => {
    const groups = groupChargesByPeriodEnd([
      charge("x", "A", "2026-11-01", "2026-11-30"),
      charge("y", "B", "2026-11-01", "2026-12-06"),
    ]);
    expect(groups.map((g) => g.periodEnd)).toEqual(["2026-12-06", "2026-11-30"]);
  });

  it("returns nothing for no charges", () => {
    expect(groupChargesByPeriodEnd([])).toEqual([]);
  });
});

describe("last ends, lookback and never-closed passengers", () => {
  const charges = [
    charge("a1", "A", "2026-10-01", "2026-10-31"),
    charge("a2", "A", "2026-11-01", "2026-12-06"),
    charge("b1", "B", "2026-10-01", "2026-11-30"),
  ];

  it("keeps the latest end of each passenger", () => {
    expect(Object.fromEntries(lastClosedEnds(charges))).toEqual({ A: "2026-12-06", B: "2026-11-30" });
  });

  it("the lookback is the smallest 'last end + 1'", () => {
    expect(openCycleLookback(charges)).toBe("2026-12-01");
    expect(openCycleLookback([])).toBeNull();
  });

  it("crosses the end of the year", () => {
    expect(openCycleLookback([charge("z", "Z", "2026-12-01", "2026-12-31")])).toBe("2027-01-01");
  });

  it("lists the passengers that never closed", () => {
    expect(neverClosedPassengerIds(["A", "B", "C", "D"], charges)).toEqual(["C", "D"]);
    expect(neverClosedPassengerIds(["A"], [])).toEqual(["A"]);
  });
});

describe("periodTotals", () => {
  const rides = [
    ride("r1", "A", "2026-11-01"),
    ride("r2", "A", "2026-12-06", 20),
    ride("r3", "A", "2026-12-07"),
    ride("r4", "A", "2026-10-31"),
    ride("r5", "B", "2026-11-10"),
  ];
  const compensations = [received("c1", "A", "2026-11-15", 5), received("c2", "A", "2026-12-07", 1)];

  it("includes both ends and only the passenger's own rows", () => {
    expect(periodTotals(rides, compensations, "A", "2026-11-01", "2026-12-06")).toEqual({
      rideCents: 3000,
      compensationCents: 500,
      totalCents: 2500,
      count: 3,
    });
  });

  it("is zero for an empty period", () => {
    expect(periodTotals(rides, compensations, "A", "2027-01-01", "2027-01-31")).toMatchObject({
      totalCents: 0,
      count: 0,
    });
  });

  it("sums in exact cents", () => {
    const cents = [ride("x", "A", "2026-11-01", 0.1), ride("y", "A", "2026-11-02", 0.2)];
    expect(periodTotals(cents, [], "A", "2026-11-01", "2026-11-30").totalCents).toBe(30);
  });

  it("a negative total is kept (compensation above the rides)", () => {
    expect(periodTotals([ride("x", "A", "2026-11-01", 10)], [received("y", "A", "2026-11-02", 25)], "A", "2026-11-01", "2026-11-30").totalCents).toBe(-1500);
  });
});

describe("buildOpenCycle", () => {
  const today = "2026-12-10";
  const closed = [
    charge("a", "A", "2026-11-01", "2026-12-06"),
    charge("b", "B", "2026-11-05", "2026-11-30"),
  ];

  it("starts each passenger the day after the last end, or at their first movement if they never closed", () => {
    const open = buildOpenCycle(
      closed,
      [
        ride("a-old", "A", "2026-12-06"),
        ride("a-new", "A", "2026-12-08"),
        ride("b-new", "B", "2026-12-02"),
        ride("c1", "C", "2026-12-04"),
        ride("c2", "C", "2026-12-09"),
      ],
      [received("c-comp", "C", "2026-12-03", 4)],
      today,
    );
    expect(open.rows.map((r) => [r.passengerId, r.start, r.totals.totalCents])).toEqual([
      ["A", "2026-12-07", 1000],
      ["B", "2026-12-01", 1000],
      ["C", "2026-12-03", 1600],
    ]);
    expect(open.periodStart).toBe("2026-12-01");
  });

  it("a passenger with no movement after the last end is not listed and does not set the start", () => {
    const open = buildOpenCycle(closed, [ride("a-old", "A", "2026-12-06"), ride("a-new", "A", "2026-12-08")], [], today);
    expect(open.rows.map((r) => r.passengerId)).toEqual(["A"]);
    expect(open.periodStart).toBe("2026-12-07");
  });

  it("is empty when everything is inside closed cycles", () => {
    const open = buildOpenCycle(closed, [ride("a-old", "A", "2026-12-06")], [], today);
    expect(open).toEqual({ periodStart: null, rows: [] });
  });

  it("is empty with no rides at all", () => {
    expect(buildOpenCycle([], [], [], today)).toEqual({ periodStart: null, rows: [] });
  });

  it("a never-closed passenger counts a compensation as the first movement", () => {
    const open = buildOpenCycle([], [ride("c", "C", "2026-12-05")], [received("k", "C", "2026-12-02", 3)], today);
    expect(open.rows[0]).toMatchObject({ passengerId: "C", start: "2026-12-02" });
  });

  it("ignores rows dated after today", () => {
    const open = buildOpenCycle([], [ride("c", "C", "2026-12-11")], [], today);
    expect(open.rows).toEqual([]);
  });
});

describe("mergeById", () => {
  it("keeps the first copy of a repeated id and the order of arrival", () => {
    expect(mergeById([{ id: "1", v: "a" }, { id: "2", v: "b" }], [{ id: "2", v: "x" }, { id: "3", v: "c" }])).toEqual([
      { id: "1", v: "a" },
      { id: "2", v: "b" },
      { id: "3", v: "c" },
    ]);
  });
});

describe("pendingCents follows the MonthHero reading", () => {
  const row = (amount: number, paidAmount: number, paid: boolean, status: "closed" | "preview" | "outdated" = "closed") => ({ amount, paidAmount, paid, status });

  it.each([
    ["unpaid", row(126, 0, false), 12600],
    ["partial: the paid part comes off", row(126, 90, false), 3600],
    ["settled", row(126, 126, true), 0],
    ["overpaid is a refund, not a pending amount", row(12, 27, true), 0],
    ["negative total is a refund", row(-10, 0, false), 0],
    ["zero", row(0, 0, true), 0],
    ["a preview is not a charge", row(50, 0, false, "preview"), 0],
    ["an outdated charge is not counted either", row(50, 0, false, "outdated"), 0],
  ])("%s", (_name, input, expected) => {
    expect(pendingCents(input)).toBe(expected);
  });
});

describe("date helpers for cycles", () => {
  it("nextDay crosses month, year and leap day", () => {
    expect(nextDay("2026-11-30")).toBe("2026-12-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2024-02-29")).toBe("2024-03-01");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
  });

  it("nextDay rejects an invalid date", () => {
    expect(() => nextDay("2026-02-30")).toThrow();
  });

  it("formats the day and month, and the whole period", () => {
    expect(formatDayMonth("2026-11-05")).toBe("05/11");
    expect(formatPeriodLabel("2026-11-01", "2026-12-06")).toBe("01/11/2026 a 06/12/2026");
  });
});
