import { describe, expect, it } from "vitest";
import {
  buildOpenCycle,
  closeCycleMinDate,
  extensibleCharges,
  groupChargesByPeriodEnd,
  hasNoOpenCycle,
  lastClosedEnds,
  neverClosedPassengerIds,
  openCycleLookback,
  openCycleStart,
} from "@/utils/cycles";
import type { MonthlyCharge, ReceivedRide, Ride } from "@/types/entities";

const charge = (
  id: string,
  passengerId: string,
  periodStart: string,
  periodEnd: string,
  extensible = false,
  totalAmount = 10,
): MonthlyCharge => ({
  id,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  revision: 1,
  activePaymentId: null,
  totalAmount,
  paid: false,
  paidAmount: 0,
  paidAt: null,
  createdAt: "",
  extensible,
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

// Novembro ficou aberto (extensível) e o ciclo já passou de 30/11.
const open = charge("a-nov", "A", "2026-11-01", "2026-11-30", true, 100);
const closedOct = charge("a-oct", "A", "2026-10-01", "2026-10-31");
const closedBNov = charge("b-nov", "B", "2026-11-01", "2026-11-30");

describe("extensibleCharges", () => {
  it("keeps only the open cycles", () => {
    expect(extensibleCharges([closedOct, open, closedBNov]).map((c) => c.id)).toEqual(["a-nov"]);
  });
});

describe("groupChargesByPeriodEnd with an extensible charge", () => {
  it("leaves the open cycle out of the closed ones, so it never shows twice", () => {
    const groups = groupChargesByPeriodEnd([closedOct, open, closedBNov]);
    expect(groups.map((g) => g.periodEnd)).toEqual(["2026-11-30", "2026-10-31"]);
    expect(groups[0]!.charges.map((c) => c.id)).toEqual(["b-nov"]);
  });

  it("is empty when the only charge is open", () => {
    expect(groupChargesByPeriodEnd([open])).toEqual([]);
  });
});

describe("last ends, lookback and start with an extensible charge", () => {
  it("a passenger with an open cycle has no closed end, even with older closed cycles", () => {
    expect(lastClosedEnds([closedOct, open])).toEqual(new Map());
    expect(lastClosedEnds([closedOct, open, closedBNov])).toEqual(new Map([["B", "2026-11-30"]]));
  });

  it("the lookback only counts passengers that are really closed", () => {
    expect(openCycleLookback([closedOct, open])).toBeNull();
    expect(openCycleLookback([closedOct, open, closedBNov])).toBe("2026-12-01");
  });

  it("the open range starts at the open cycle's own start", () => {
    expect(openCycleStart([open], "2026-12-10")).toBe("2026-11-01");
    expect(openCycleStart([closedOct, open], "2026-12-10")).toBe("2026-11-01");
  });

  it("takes the earliest between the open cycle and the closed passengers' lookback", () => {
    const lateOpen = charge("c", "C", "2026-12-01", "2026-12-31", true);
    expect(openCycleStart([lateOpen, closedBNov], "2026-12-10")).toBe("2026-12-01");
    expect(openCycleStart([open, closedBNov], "2026-12-10")).toBe("2026-11-01");
  });

  it("still ignores a lookback after today when an open cycle exists", () => {
    const closedLate = charge("d", "D", "2026-12-01", "2026-12-31");
    expect(openCycleStart([open, closedLate], "2026-12-10")).toBe("2026-11-01");
  });

  it("without extensible charges nothing changes", () => {
    expect(openCycleStart([closedOct], "2026-12-10")).toBe("2026-11-01");
    expect(openCycleStart([], "2026-12-10")).toBeNull();
  });

  it("a passenger with only an open cycle is not 'never closed'", () => {
    expect(neverClosedPassengerIds(["A", "Z"], [open])).toEqual(["Z"]);
  });
});

describe("hasNoOpenCycle with an extensible charge", () => {
  it("is never true: an open cycle is an open cycle", () => {
    const closedLate = charge("d", "D", "2026-12-01", "2026-12-31");
    expect(hasNoOpenCycle([closedLate], [], "2026-12-10")).toBe(true);
    expect(hasNoOpenCycle([closedLate, open], [], "2026-12-10")).toBe(false);
    expect(hasNoOpenCycle([open], [], "2026-12-10")).toBe(false);
  });
});

describe("closeCycleMinDate with an extensible charge", () => {
  it("cannot be earlier than the open cycle's start", () => {
    expect(closeCycleMinDate([open], ["A"], "2026-12-10")).toBe("2026-11-01");
  });

  it("applies even when someone with movement never closed", () => {
    expect(closeCycleMinDate([open], ["A", "Z"], "2026-12-10")).toBe("2026-11-01");
  });

  it("offers the open cycle's start even when the closed passengers' lookback is later", () => {
    // A (aberto desde 01/11) pode ser encerrada em 15/11, mesmo com B fechada até 30/11.
    expect(closeCycleMinDate([open, closedBNov], ["A", "B"], "2026-12-10")).toBe("2026-11-01");
  });

  it("never goes below the latest open start, which the database enforces", () => {
    const lateOpen = charge("c", "C", "2026-12-05", "2026-12-31", true);
    expect(closeCycleMinDate([lateOpen, closedBNov], ["B", "C"], "2026-12-10")).toBe("2026-12-05");
  });

  it("without extensible charges nothing changes", () => {
    expect(closeCycleMinDate([closedBNov], ["B"], "2026-12-10")).toBe("2026-12-01");
    expect(closeCycleMinDate([closedBNov], ["B", "Z"], "2026-12-10")).toBeUndefined();
  });
});

describe("buildOpenCycle with an extensible charge", () => {
  const rides = [
    ride("r1", "A", "2026-11-10", 40),
    ride("r2", "A", "2026-12-03", 25),
    ride("r3", "B", "2026-12-04", 30),
  ];

  it("lists the open cycle through the stored charge, counting rides after the month's end", () => {
    const { rows, periodStart } = buildOpenCycle([open, closedBNov], rides, [], "2026-12-10");
    const a = rows.find((row) => row.passengerId === "A")!;
    expect(a.charge).toBe(open);
    expect(a.start).toBe("2026-11-01");
    expect(a.totals.rideCents).toBe(6500);
    expect(a.totals.count).toBe(2);
    expect(periodStart).toBe("2026-11-01");
  });

  it("never adds a preview for a passenger that already has an open cycle", () => {
    const { rows } = buildOpenCycle([open], rides, [], "2026-12-10");
    expect(rows.filter((row) => row.passengerId === "A")).toHaveLength(1);
  });

  it("an older closed cycle of the same passenger does not start a second row", () => {
    const { rows } = buildOpenCycle([closedOct, open], rides, [], "2026-12-10");
    expect(rows.filter((row) => row.passengerId === "A")).toHaveLength(1);
    expect(rows.find((row) => row.passengerId === "A")!.start).toBe("2026-11-01");
  });

  it("the other passengers still start the day after their last end, with no charge attached", () => {
    const { rows } = buildOpenCycle([open, closedBNov], rides, [], "2026-12-10");
    const b = rows.find((row) => row.passengerId === "B")!;
    expect(b.start).toBe("2026-12-01");
    expect(b.totals.rideCents).toBe(3000);
    expect("charge" in b).toBe(false);
  });

  it("lists the open cycle even with no movement yet", () => {
    const { rows } = buildOpenCycle([open], [], [], "2026-12-10");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.totals.count).toBe(0);
  });

  it("subtracts compensations of the open cycle", () => {
    const { rows } = buildOpenCycle([open], rides, [received("c1", "A", "2026-12-05", 15)], "2026-12-10");
    expect(rows[0]!.totals.totalCents).toBe(5000);
  });

  it("without extensible charges the rows have no charge", () => {
    const { rows } = buildOpenCycle([closedBNov], rides, [], "2026-12-10");
    expect(rows.every((row) => !("charge" in row))).toBe(true);
  });
});
