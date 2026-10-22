import { describe, expect, it } from "vitest";
import type { ChargePaymentEvent } from "@/types/entities";
import { latestOpenPayment } from "@/utils/chargePayments";

const payment = (id: string, revision: number, signedAmount: number, chargeId = "C"): ChargePaymentEvent => ({
  id,
  monthlyChargeId: chargeId,
  kind: "PAYMENT",
  revision,
  signedAmount,
  relatedPaymentId: null,
});
const cancel = (paymentId: string, revision: number, signedAmount: number): ChargePaymentEvent => ({
  id: `cancel-${paymentId}`,
  monthlyChargeId: "C",
  kind: "CANCEL",
  revision,
  signedAmount,
  relatedPaymentId: paymentId,
});

// Production history: the first 15 was zeroed by the old REOPEN (0008).
const legacy = [payment("p15-old", 1, 15), payment("p12", 3, 12), payment("p15-new", 4, 15)];

describe("latest open payment", () => {
  it("is the newest payment when the running sum reaches the amount received", () => {
    expect(latestOpenPayment(legacy, "C", 27)).toBe("p15-new");
  });

  it("walks the chain back one payment at a time and never reaches the zeroed one", () => {
    const afterFirstUndo = [...legacy, cancel("p15-new", 5, 15)];
    expect(latestOpenPayment(afterFirstUndo, "C", 12)).toBe("p12");
    const afterSecondUndo = [...afterFirstUndo, cancel("p12", 6, 12)];
    expect(latestOpenPayment(afterSecondUndo, "C", 0)).toBeNull();
  });

  it("is null when the sum never matches the amount received", () => {
    expect(latestOpenPayment(legacy, "C", 20)).toBeNull();
  });

  it("is null without payments or without anything received", () => {
    expect(latestOpenPayment([], "C", 10)).toBeNull();
    expect(latestOpenPayment([payment("p", 1, 10)], "C", 0)).toBeNull();
  });

  it("ignores other charges", () => {
    expect(latestOpenPayment([payment("other", 9, 10, "D"), payment("mine", 1, 10)], "C", 10)).toBe("mine");
  });

  it("does not depend on the order of the events", () => {
    expect(latestOpenPayment([...legacy].reverse(), "C", 27)).toBe("p15-new");
  });

  it("sums in exact cents", () => {
    expect(latestOpenPayment([payment("a", 1, 0.1), payment("b", 2, 0.2)], "C", 0.3)).toBe("b");
  });

  it("works for negative months, where the responsible account pays the passenger", () => {
    expect(latestOpenPayment([payment("a", 1, -10), payment("b", 3, -5)], "C", -15)).toBe("b");
  });
});
