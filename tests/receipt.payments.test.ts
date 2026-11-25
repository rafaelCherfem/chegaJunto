import { describe, expect, it } from "vitest";
import { buildReceiptLines } from "@/services/pdf.service";
import type { ChargePaymentEvent, MonthlyCharge, Passenger, ReceivedRide, Ride } from "@/types/entities";

const passenger: Passenger = {
  id: "p1",
  name: "Ana",
  defaultDailyRate: 15,
  active: true,
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z",
};

const ride = (rideDate: string, rateCharged = 15): Ride => ({
  id: rideDate,
  passengerId: "p1",
  rideDate,
  rateCharged,
  createdAt: `${rideDate}T12:00:00Z`,
});

const charge = (overrides: Partial<MonthlyCharge>): MonthlyCharge => ({
  revision: 1,
  activePaymentId: null,
  id: "c1",
  passengerId: "p1",
  referenceMonth: "2026-10-01",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  totalAmount: 30,
  paid: false,
  paidAmount: 0,
  paidAt: null,
  createdAt: "2026-10-20T12:00:00Z",
  extensible: false,
  ...overrides,
});

const payment = (id: string, revision: number, signedAmount: number, occurredAt: string): ChargePaymentEvent => ({
  id,
  monthlyChargeId: "c1",
  kind: "PAYMENT",
  revision,
  signedAmount,
  relatedPaymentId: null,
  occurredAt,
});
const cancel = (paymentId: string, revision: number, signedAmount: number): ChargePaymentEvent => ({
  id: `cancel-${paymentId}`,
  monthlyChargeId: "c1",
  kind: "CANCEL",
  revision,
  signedAmount,
  relatedPaymentId: paymentId,
  occurredAt: "2026-10-30T15:00:00Z",
});

const twoRides = [ride("2026-10-07"), ride("2026-10-06")];
const clean = (text: string) => text.replaceAll(String.fromCharCode(160), " ");

function receiptText(chargeOverrides: Partial<MonthlyCharge>, paymentEvents?: ChargePaymentEvent[], received: ReceivedRide[] = []) {
  return clean(
    buildReceiptLines(
      { passenger, charge: charge(chargeOverrides), rides: twoRides, receivedRides: received, periodStart: "2026-10-01", periodEnd: "2026-10-31", paymentEvents },
      "2026-10-31",
    )
      .map((line) => line.text)
      .join("\n"),
  );
}
const tail = (text: string) => text.slice(text.indexOf("Total do período"), text.indexOf("\nComprovante gerado"));

const first = payment("a", 1, 10, "2026-10-10T15:00:00Z");
const second = payment("b", 2, 8.5, "2026-10-15T15:00:00Z");

describe("received payments in the receipt", () => {
  it("lists each payment by date after the total, then what was paid and what is left", () => {
    // Fora de ordem de propósito: a lista sai por data.
    const text = receiptText({ paidAmount: 18.5 }, [second, first]);
    expect(tail(text)).toBe(
      "Total do período: R$ 30,00\n" +
        "Pagamentos recebidos\n10/10/2026  —  R$ 10,00\n15/10/2026  —  R$ 8,50\n" +
        "Já pago: R$ 18,50\nFalta pagar: R$ 11,50\nSituação: parcialmente pago",
    );
  });

  it("comes after the rides and the compensation block, never between them", () => {
    const received: ReceivedRide[] = [{ id: "x", passengerId: "p1", receivedDate: "2026-10-14", amount: 18, createdAt: "" }];
    const text = receiptText({ totalAmount: 12, paidAmount: 10 }, [first], received);
    expect(text).toContain("Diárias: R$ 30,00\nCompensação: -R$ 18,00\nTotal do período: R$ 12,00\nPagamentos recebidos");
    expect(text.indexOf("Compensações")).toBeLessThan(text.indexOf("Pagamentos recebidos"));
  });

  it("paid in full says the date of the last payment in force, not the one of the charge", () => {
    const last = payment("b", 2, 20, "2026-10-20T15:00:00Z");
    const text = tail(receiptText({ paid: true, paidAmount: 30, paidAt: "2026-10-28T15:00:00Z" }, [first, last]));
    expect(text).toBe(
      "Total do período: R$ 30,00\nPagamentos recebidos\n10/10/2026  —  R$ 10,00\n20/10/2026  —  R$ 20,00\n" +
        "Já pago: R$ 30,00\nSituação: pago integralmente em 20/10/2026",
    );
  });

  it("falls back to the date of the charge when there is no list of payments", () => {
    expect(tail(receiptText({ paid: true, paidAmount: 30, paidAt: "2026-10-28T15:00:00Z" }))).toContain(
      "Situação: pago integralmente em 28/10/2026",
    );
  });

  it("shows the payment day in São Paulo", () => {
    const text = tail(receiptText({ paid: true, paidAmount: 30 }, [payment("a", 1, 30, "2026-10-16T01:30:00Z")]));
    expect(text).toContain("15/10/2026  —  R$ 30,00");
    expect(text).toContain("pago integralmente em 15/10/2026");
  });

  it("with a balance to return lists every payment and shows the balance", () => {
    const text = tail(
      receiptText({ totalAmount: 12, paid: true, paidAmount: 30 }, [payment("a", 1, 20, "2026-10-10T15:00:00Z"), payment("b", 2, 10, "2026-10-15T15:00:00Z")]),
    );
    expect(text).toBe(
      "Total do período: R$ 12,00\nPagamentos recebidos\n10/10/2026  —  R$ 20,00\n15/10/2026  —  R$ 10,00\n" +
        "Já pago: R$ 30,00\nSaldo a devolver: R$ 18,00\nSituação: quitado em 15/10/2026, com saldo a devolver",
    );
  });

  it("a negative total lists the refunds made as positive amounts, under their own title", () => {
    const text = tail(receiptText({ totalAmount: -3, paid: true, paidAmount: -3 }, [payment("a", 1, -3, "2026-10-15T15:00:00Z")]));
    expect(text).toBe(
      "Total do período: -R$ 3,00\nDevoluções feitas\n15/10/2026  —  R$ 3,00\nDevolvido: R$ 3,00\nSituação: devolução feita em 15/10/2026",
    );
    expect(text).not.toContain("Pagamentos recebidos");
  });

  it("leaves a payment that was undone out of the list", () => {
    const text = tail(receiptText({ paidAmount: 10 }, [first, second, cancel("b", 3, 8.5)]));
    expect(text).toContain("10/10/2026  —  R$ 10,00");
    expect(text).not.toContain("15/10/2026");
    expect(text).toContain("Já pago: R$ 10,00\nFalta pagar: R$ 20,00");
  });

  it("omits the whole list when the payments in force do not add up to what was received", () => {
    // Recebido 18,50, mas só há 10,00 de histórico: nada de lista, só os totais de sempre.
    const text = receiptText({ paidAmount: 18.5 }, [first]);
    expect(text).not.toContain("Pagamentos recebidos");
    expect(tail(text)).toBe(
      "Total do período: R$ 30,00\nJá pago: R$ 18,50\nFalta pagar: R$ 11,50\nSituação: parcialmente pago",
    );
  });

  it("omits the section when nothing was paid", () => {
    expect(tail(receiptText({}, []))).toBe("Total do período: R$ 30,00\nPassageiro deve R$ 30,00\nSituação: pendente");
    expect(tail(receiptText({}))).toBe("Total do período: R$ 30,00\nPassageiro deve R$ 30,00\nSituação: pendente");
  });
});
