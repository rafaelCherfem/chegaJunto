import { describe, expect, it } from "vitest";
import { totalsByPassenger } from "@/utils/monthlyTotals";

const ride = (rateCharged: number, passengerId = "A") => ({ passengerId, rateCharged });
const compensation = (amount: number, passengerId = "A") => ({ passengerId, amount });

describe("monthly totals — current baseline", () => {
  it("100 in rides minus 20 in compensations is 80", () => {
    expect(totalsByPassenger([ride(40), ride(60)], [compensation(20)]).get("A")).toBe(8000);
  });
  it("60 minus 80 is -20, owed by the responsible account", () => {
    expect(totalsByPassenger([ride(60)], [compensation(80)]).get("A")).toBe(-2000);
  });
  it("zero rides and zero compensations yield zero when a passenger exists", () => {
    expect(totalsByPassenger([ride(0)], [compensation(0)]).get("A")).toBe(0);
  });
  it("empty input has no passengers; its aggregate is zero", () => {
    const totals = totalsByPassenger([], []);
    expect(totals.size).toBe(0);
    expect([...totals.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });
  it("does not combine different passengers", () => {
    expect([
      ...totalsByPassenger(
        [ride(100), ride(50, "B")],
        [compensation(20), compensation(60, "B")],
      ),
    ]).toEqual([
      ["A", 8000],
      ["B", -1000],
    ]);
  });
  it("supports a passenger with compensations only", () => {
    expect(totalsByPassenger([], [compensation(20)]).get("A")).toBe(-2000);
  });
  it("computes 0.10 + 0.20 as exactly 30 cents", () => { expect(totalsByPassenger([ride(0.1),ride(0.2)],[]).get("A")).toBe(30); });
  it("computes exact integer cents of 0.30 minus 0.10 to 20 cents", () => {
    const total = totalsByPassenger([ride(0.3)], [compensation(0.1)]).get("A")!;
    expect(total).toBe(20);
  });
});
