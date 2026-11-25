import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReceiptLines, generateMonthlyReceipt, paginateReceipt } from "@/services/pdf.service";
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

// Ciclo longo: n diárias em dias seguidos, a partir de 01/09/2026.
function manyRides(count: number): Ride[] {
  return Array.from({ length: count }, (_, i) => ride(new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10)));
}
function longReceipt(rideCount: number, payments: ChargePaymentEvent[]) {
  const rides = manyRides(rideCount);
  const paid = payments.reduce((sum, p) => sum + p.signedAmount, 0);
  const data = {
    passenger,
    charge: charge({ totalAmount: rideCount * 15, paidAmount: paid, periodStart: "2026-09-01", periodEnd: "2026-12-31" }),
    rides,
    receivedRides: [],
    periodStart: "2026-09-01",
    periodEnd: "2026-12-31",
    paymentEvents: payments,
  };
  return { data, lines: buildReceiptLines(data, "2026-12-31") };
}
const heightOf = (line: { spaceBefore?: number; size?: number }) => (line.spaceBefore ?? 0) + (line.size ?? 11) + 8;
const CAPACITY = 841.89 - 2 * 48;
const threePayments = [
  payment("a", 1, 10, "2026-10-10T15:00:00Z"),
  payment("b", 2, 20, "2026-10-20T15:00:00Z"),
  payment("c", 3, 8.5, "2026-11-05T15:00:00Z"),
];

describe("receipt pagination", () => {
  it("a short receipt stays on one page", () => {
    const { lines } = longReceipt(2, [first]);
    expect(paginateReceipt(lines)).toHaveLength(1);
  });

  it("38 rides (the seed's Fernanda cycle) and 45 rides with payments take two pages", () => {
    expect(paginateReceipt(longReceipt(38, threePayments).lines)).toHaveLength(2);
    expect(paginateReceipt(longReceipt(45, threePayments).lines)).toHaveLength(2);
  });

  it("repeats the title of the cycle and the passenger name at the top of every page", () => {
    const pages = paginateReceipt(longReceipt(150, threePayments).lines);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    for (const page of pages) {
      expect(page[0]!.text).toBe("chegaJunto");
      expect(page[1]!.text).toBe("Comprovante de diárias — 01/09/2026 a 31/12/2026");
      expect(page[2]!.text).toBe("Passageiro: Ana");
    }
  });

  it("never lets the lines of a page go past the bottom margin", () => {
    for (const count of [30, 38, 45, 60, 150]) {
      for (const page of paginateReceipt(longReceipt(count, threePayments).lines)) {
        expect(page.reduce((sum, line) => sum + heightOf(line), 0)).toBeLessThanOrEqual(CAPACITY);
      }
    }
  });

  it("keeps every line, once and in order, only adding the repeated header", () => {
    const { lines } = longReceipt(45, threePayments);
    const body = lines.filter((line) => !line.repeat).map((line) => line.text);
    const paged = paginateReceipt(lines).flatMap((page) => page.filter((line) => !line.repeat).map((line) => line.text));
    expect(paged).toEqual(body);
  });

  it("never starts a page with blank space before the first line", () => {
    const pages = paginateReceipt(longReceipt(45, threePayments).lines);
    expect(pages[1]![3]!.spaceBefore ?? 0).toBe(0);
  });

  it("keeps the total block together with its title, whatever the number of rides", () => {
    for (let count = 1; count <= 90; count++) {
      const pages = paginateReceipt(longReceipt(count, threePayments).lines);
      const texts = pages.map((page) => page.map((line) => line.text));
      const where = (prefix: string) => texts.findIndex((page) => page.some((text) => text.startsWith(prefix)));
      // Total, título dos pagamentos, o primeiro e o último pagamento e a situação, na mesma página.
      expect(where("Situação:"), `${count} diárias`).toBe(where("Total do período"));
      expect(where("Pagamentos recebidos"), `${count} diárias`).toBe(where("Total do período"));
      expect(where("Já pago"), `${count} diárias`).toBe(where("Total do período"));
      // O título das diárias nunca fica sozinho no fim da página.
      const heading = texts[where("Diárias registradas")]!;
      expect(heading.indexOf("Diárias registradas")).toBeLessThan(heading.length - 1);
    }
  });

  it("with many payments the list may cross pages, but the title keeps the first one and the summary keeps the last", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      payment(`p${i}`, i + 1, 1, `2026-10-${String((i % 28) + 1).padStart(2, "0")}T15:00:00Z`),
    );
    const { lines } = longReceipt(30, many);
    const pages = paginateReceipt(lines).map((page) => page.map((line) => line.text));
    const pageOf = (predicate: (text: string) => boolean) => pages.findIndex((page) => page.some(predicate));
    expect(pages.length).toBeGreaterThan(1);
    expect(pageOf((text) => text.startsWith("Total do período"))).toBe(pageOf((text) => text === "Pagamentos recebidos"));
    const heading = pages[pageOf((text) => text === "Pagamentos recebidos")]!;
    expect(heading.indexOf("Pagamentos recebidos")).toBeLessThan(heading.length - 1);
    expect(pageOf((text) => text.startsWith("Já pago"))).toBe(pageOf((text) => text.startsWith("Situação:")));
    const summary = pages[pageOf((text) => text.startsWith("Já pago"))]!;
    // A linha logo acima do "Já pago" é o último pagamento.
    expect(summary[summary.findIndex((text) => text.startsWith("Já pago")) - 1]).toMatch(/^\d{2}\/\d{2}\/2026/);
  });
});

describe("receipt PDF with pagination", () => {
  it("opens as a real PDF with the number of pages the layout planned", async () => {
    for (const count of [2, 38, 45, 150]) {
      const { data, lines } = longReceipt(count, threePayments);
      const bytes = await generateMonthlyReceipt(data);
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount(), `${count} diárias`).toBe(paginateReceipt(lines).length);
    }
    const short = await PDFDocument.load(await generateMonthlyReceipt(longReceipt(2, [first]).data));
    expect(short.getPageCount()).toBe(1);
    const long = await PDFDocument.load(await generateMonthlyReceipt(longReceipt(45, threePayments).data));
    expect(long.getPageCount()).toBe(2);
  });
});
