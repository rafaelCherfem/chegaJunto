import { describe, expect, it } from "vitest";
import { chargeState, chargeTexts } from "@/utils/chargeState";

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

  it("total negativo sem devolução registrada: a devolver, nunca quitado", () => {
    const s = chargeState({ ...base, amount: -15, paid: false });
    expect(s).toMatchObject({
      settled: false,
      partial: false,
      isRefund: true,
      refundStatus: "due",
      refundCents: 1500,
      cents: -1500,
    });
  });

  it("total negativo com devolução registrada: devolvido, sem saldo em aberto", () => {
    const s = chargeState({ ...base, amount: -15, paidAmount: -15, paid: true });
    expect(s).toMatchObject({
      settled: true,
      isRefund: true,
      refundStatus: "done",
      refundCents: 0,
      returnedCents: 1500,
    });
  });

  it("total negativo com devolução parcial: falta devolver só a diferença", () => {
    const s = chargeState({ ...base, amount: -15, paidAmount: -5, paid: false });
    expect(s).toMatchObject({
      settled: false,
      partial: true,
      refundStatus: "partial",
      refundCents: 1000,
      returnedCents: 500,
    });
  });

  it("total negativo depois de receber: devolve o recebido mais o total", () => {
    const s = chargeState({ ...base, amount: -5, paidAmount: 10, paid: false });
    expect(s).toMatchObject({ partial: false, refundStatus: "due", refundCents: 1500 });
  });

  it("total zero sem pagamento: sem obrigação e sem estado de devolução", () => {
    const s = chargeState({ ...base, amount: 0, paid: true });
    expect(s).toMatchObject({ hasObligation: false, refundStatus: null, refundCents: 0 });
  });

  it("total positivo pago a mais continua como saldo a devolver (overpaid)", () => {
    const s = chargeState({ ...base, amount: 204, paidAmount: 254, paid: true });
    expect(s).toMatchObject({ refundStatus: "overpaid", refundCents: 5000, isRefund: false });
  });

  it("prévia e desatualizada nunca contam como quitadas ou parciais", () => {
    for (const status of ["preview", "outdated"] as const) {
      const s = chargeState({ status, amount: 20, paidAmount: 5, paid: true });
      expect(s).toMatchObject({ settled: false, partial: false, refundCents: 0 });
    }
  });
  it("prévia nunca vira estado de devolução", () => {
    const refund = chargeState({ status: "preview", amount: -20, paid: false });
    expect(refund).toMatchObject({ refundStatus: null, refundCents: 0 });
  });

  it("textos: devolver quando o total é negativo, pagar quando o passageiro deve", () => {
    const text = (input: Parameters<typeof chargeState>[0]) => chargeTexts(chargeState(input));
    expect(text({ ...base, amount: -15, paid: false })).toMatchObject({
      payLabel: "Marcar como devolvido",
      unmarkLabel: "Desmarcar devolução",
      settledText: "Devolução feita",
    });
    expect(text({ ...base, amount: -15, paidAmount: -5, paid: false }).payLabel).toMatch(
      /^Devolver R\$\s10,00$/,
    );
    expect(text({ ...base, amount: 30, paid: false }).payLabel).toBe("Marcar como pago");
    expect(text({ ...base, amount: 30, paidAmount: 10, paid: false }).payLabel).toMatch(
      /^Pagar R\$\s20,00$/,
    );
    expect(text({ ...base, amount: 30, paid: true }).settledText).toBe("Pagamento recebido");
  });
});
