import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildReceiptLines,
  generateMonthlyReceipt,
  stripUnsupported,
} from "@/services/pdf.service";
import type { MonthlyCharge, Passenger, ReceivedRide, Ride } from "@/types/entities";

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

const received = (receivedDate: string, amount: number): ReceivedRide => ({
  id: receivedDate,
  passengerId: "p1",
  receivedDate,
  amount,
  createdAt: `${receivedDate}T12:00:00Z`,
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
  createdAt: "2026-10-20T12:00:00Z", extensible: false,
  ...overrides,
});

const twoRides = [ride("2026-10-07"), ride("2026-10-06")];
const compensation = [received("2026-10-14", 18)];

function receiptText(
  chargeOverrides: Partial<MonthlyCharge>,
  receivedRides: ReceivedRide[] = [],
  rides: Ride[] = twoRides,
) {
  return buildReceiptLines(
    { passenger, charge: charge(chargeOverrides), rides, receivedRides, periodStart: "2026-10-01", periodEnd: "2026-10-31" },
    "2026-10-21",
  )
    .map((line) => line.text)
    .join("\n")
    .replaceAll(String.fromCharCode(160), " ");
}

function tail(text: string) {
  return text.slice(text.indexOf("Total do período"), text.indexOf("\nComprovante gerado"));
}

describe("monthly receipt text", () => {
  it("lists rides in date order with the header and footer", () => {
    const text = receiptText({});
    expect(text).toContain("Passageiro: Ana");
    expect(text.indexOf("06/10/2026  —  R$ 15,00")).toBeLessThan(
      text.indexOf("07/10/2026  —  R$ 15,00"),
    );
    expect(text).toContain("Comprovante gerado em 21/10/2026");
    expect(text).not.toContain("Compensações");
    expect(text).not.toContain("Diárias: ");
  });

  it("pending shows what the passenger owes", () => {
    expect(tail(receiptText({}))).toBe(
      "Total do período: R$ 30,00\nPassageiro deve R$ 30,00\nSituação: pendente",
    );
  });

  it("partial shows what was paid and what is left, not the full debt", () => {
    expect(tail(receiptText({ paidAmount: 10 }))).toBe(
      "Total do período: R$ 30,00\nJá pago: R$ 10,00\nFalta pagar: R$ 20,00\nSituação: parcialmente pago",
    );
  });

  it("paid never says the passenger owes and shows the payment date in São Paulo", () => {
    const text = tail(
      receiptText({ paid: true, paidAmount: 30, paidAt: "2026-10-16T01:30:00Z" }),
    );
    expect(text).toBe(
      "Total do período: R$ 30,00\nJá pago: R$ 30,00\nSituação: pago integralmente em 15/10/2026",
    );
    expect(text).not.toContain("deve");
  });

  it("explains the compensation between the rides and the total", () => {
    const text = receiptText({ totalAmount: 12 }, compensation);
    expect(text).toContain("Compensações\n14/10/2026  —  R$ 18,00\n");
    expect(tail(text)).toBe(
      "Total do período: R$ 12,00\nPassageiro deve R$ 12,00\nSituação: pendente",
    );
    expect(text).toContain(
      "Diárias: R$ 30,00\nCompensação: -R$ 18,00\nTotal do período: R$ 12,00",
    );
  });

  it("paid with a refund says it is settled with a balance to return", () => {
    const text = tail(
      receiptText(
        { totalAmount: 12, paid: true, paidAmount: 30, paidAt: "2026-10-15T15:00:00Z" },
        compensation,
      ),
    );
    expect(text).toBe(
      "Total do período: R$ 12,00\nJá pago: R$ 30,00\nSaldo a devolver: R$ 18,00\n" +
        "Situação: quitado em 15/10/2026, com saldo a devolver",
    );
    expect(text).not.toContain("integralmente");
  });

  it("keeps the driver's debt when compensations exceed the rides", () => {
    const text = receiptText({ totalAmount: -3 }, [received("2026-10-14", 33)]);
    expect(tail(text)).toBe(
      "Total do período: -R$ 3,00\nVocê deve R$ 3,00 ao passageiro\nSituação: pendente",
    );
  });

  it("negative total with the refund registered says the refund was made, never paid", () => {
    const text = tail(
      receiptText(
        { totalAmount: -3, paid: true, paidAmount: -3, paidAt: "2026-10-15T15:00:00Z" },
        [received("2026-10-14", 33)],
      ),
    );
    expect(text).toBe(
      "Total do período: -R$ 3,00\nDevolvido: R$ 3,00\nSituação: devolução feita em 15/10/2026",
    );
    expect(text).not.toContain("pago");
  });

  it("negative total with a partial refund shows what was returned and what is left", () => {
    expect(
      tail(receiptText({ totalAmount: -3, paidAmount: -1 }, [received("2026-10-14", 33)])),
    ).toBe(
      "Total do período: -R$ 3,00\nJá devolvido: R$ 1,00\nFalta devolver: R$ 2,00\nSituação: devolução parcial",
    );
  });

  it("zero total without payment has no obligation", () => {
    expect(tail(receiptText({ totalAmount: 0 }, [], []))).toBe(
      "Total do período: R$ 0,00\nNenhum valor pendente\nSituação: sem obrigação",
    );
  });
});

describe("receipt for a cycle that crosses months", () => {
  const cycle = (overrides: Partial<MonthlyCharge> = {}) =>
    charge({
      referenceMonth: "2026-11-01",
      periodStart: "2026-11-01",
      periodEnd: "2026-12-06",
      totalAmount: 45,
      ...overrides,
    });
  const lines = (c: MonthlyCharge, rides: Ride[], receivedRides: ReceivedRide[] = []) =>
    buildReceiptLines(
      { passenger, charge: c, rides, receivedRides, periodStart: c.periodStart, periodEnd: c.periodEnd },
      "2026-12-07",
    ).map((line) => line.text.replaceAll(String.fromCharCode(160), " "));

  it("titles the receipt with the real dates of the cycle", () => {
    const text = lines(cycle(), [ride("2026-11-20"), ride("2026-12-05"), ride("2026-12-06")]);
    expect(text).toContain("Comprovante de diárias — 01/11/2026 a 06/12/2026");
    expect(text.join("\n")).not.toContain("novembro");
    expect(text.join("\n")).not.toContain("de 2026 —");
  });

  it("lists rides of both months in date order under a single total", () => {
    const text = lines(cycle(), [ride("2026-12-05"), ride("2026-11-20"), ride("2026-12-06")]).join("\n");
    const at = (date: string) => text.indexOf(`${date}  —  R$ 15,00`);
    expect(at("20/11/2026")).toBeGreaterThan(-1);
    expect(at("20/11/2026")).toBeLessThan(at("05/12/2026"));
    expect(at("05/12/2026")).toBeLessThan(at("06/12/2026"));
    expect(text.match(/Total do período/g)).toHaveLength(1);
    expect(text).toContain("Total do período: R$ 45,00");
    expect(text).not.toContain("Total do mês");
  });

  it("keeps the payment situation of the cycle charge", () => {
    const text = lines(cycle({ paidAmount: 20 }), [ride("2026-11-20")]).join("\n");
    expect(text).toContain("Já pago: R$ 20,00\nFalta pagar: R$ 25,00\nSituação: parcialmente pago");
  });

  it("an empty period says so with the period wording", () => {
    const text = lines(cycle({ totalAmount: 0 }), []);
    expect(text).toContain("Nenhuma diária registrada neste período.");
    expect(text.join("\n")).not.toContain("competência");
  });

  it("a monthly cycle still shows the whole month as dates", () => {
    const text = lines(charge({}), [ride("2026-10-07")]);
    expect(text).toContain("Comprovante de diárias — 01/10/2026 a 31/10/2026");
  });
});

describe("monthly receipt PDF", () => {
  async function helvetica() {
    const probe = await PDFDocument.create();
    return probe.embedFont(StandardFonts.Helvetica);
  }

  it("removes characters the standard font cannot encode and the space left behind", async () => {
    const font = await helvetica();
    const supported = new Set(font.getCharacterSet());
    expect(() => font.encodeText("Ana 🚗")).toThrow();

    expect(stripUnsupported("Passageiro: Ana 🚗 Souza", supported)).toBe(
      "Passageiro: Ana Souza",
    );
    expect(stripUnsupported("Passageiro: Ana 🚗👨‍👩‍👧 Souza", supported)).toBe(
      "Passageiro: Ana Souza",
    );
    expect(stripUnsupported("Passageiro: Ana 🚗", supported)).toBe("Passageiro: Ana");
    expect(stripUnsupported("Passageiro: 🚗 Ana", supported)).toBe("Passageiro: Ana");
    expect(stripUnsupported("06/10/2026  —  R$ 15,00 José", supported)).toBe(
      "06/10/2026  —  R$ 15,00 José",
    );
  });

  it("generates the PDF when the passenger name has emoji", async () => {
    const font = await helvetica();
    const supported = new Set(font.getCharacterSet());
    const lines = buildReceiptLines({
      passenger: { ...passenger, name: "Ana 🚗 Souza" },
      charge: charge({}),
      rides: twoRides,
      receivedRides: [],
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    expect(lines.map((line) => stripUnsupported(line.text, supported))).toContain(
      "Passageiro: Ana Souza",
    );

    const bytes = await generateMonthlyReceipt({
      passenger: { ...passenger, name: "Ana 🚗👨‍👩‍👧 Souza" },
      charge: charge({ totalAmount: 12, paid: true, paidAmount: 30, paidAt: "2026-10-15T15:00:00Z" }),
      rides: twoRides,
      receivedRides: compensation,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
