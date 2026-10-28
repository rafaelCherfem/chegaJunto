import { describe, expect, it } from "vitest";
import { chargeState } from "@/utils/chargeState";

const base = { status: "closed" as const };

describe("chargeState", () => {
  it("pendente: nada pago, deve o total", () => {
    const s = chargeState({ ...base, amount: 99, paid: false });
    expect(s).toMatchObject({ settled: false, partial: false, outstandingCents: 9900, refundCents: 0 });
  });

  it("parcial: preserva o pago e cobra só a diferença", () => {
    const s = chargeState({ ...base, amount: 256, paidAmount: 231, paid: false });
    expect(s).toMatchObject({ settled: false, partial: true, outstandingCents: 2500, refundCents: 0 });
  });

  it("pago por completo: quitado, sem saldo a devolver", () => {
    const s = chargeState({ ...base, amount: 230, paidAmount: 230, paid: true });
    expect(s).toMatchObject({ settled: true, partial: false, refundCents: 0 });
  });

  it("total abaixo do pago: quitado com saldo a devolver", () => {
    const s = chargeState({ ...base, amount: 204, paidAmount: 254, paid: true });
    expect(s).toMatchObject({ settled: true, refundCents: 5000 });
  });

  it("total zero com valor pago: tudo vira saldo a devolver", () => {
    const s = chargeState({ ...base, amount: 0, paidAmount: 20, paid: true });
    expect(s).toMatchObject({ settled: true, refundCents: 2000, hasObligation: true });
  });

  it("total zero sem pagamento não tem obrigação", () => {
    expect(chargeState({ ...base, amount: 0, paid: true }).hasObligation).toBe(false);
  });

  it("total negativo não gera saldo a devolver (é o responsável quem deve)", () => {
    const s = chargeState({ ...base, amount: -20, paid: false });
    expect(s).toMatchObject({ settled: false, partial: false, refundCents: 0, cents: -2000 });
  });

  it("prévia e desatualizada nunca contam como quitadas ou parciais", () => {
    for (const status of ["preview", "outdated"] as const) {
      const s = chargeState({ status, amount: 20, paidAmount: 5, paid: true });
      expect(s).toMatchObject({ settled: false, partial: false, refundCents: 0 });
    }
  });
});
