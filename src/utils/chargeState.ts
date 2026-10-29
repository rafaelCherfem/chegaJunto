import { formatCurrency } from "@/utils/currency";
import { toCents } from "@/utils/money";

export type ChargeStatus = "closed" | "preview" | "outdated";

export interface ChargeStateInput {
  amount: number;
  paidAmount?: number | undefined;
  paid: boolean;
  status: ChargeStatus;
}

// due: nada devolvido ainda; partial: devolução parcial; done: devolvida;
// overpaid: total positivo que ficou abaixo do que já foi pago.
export type RefundStatus = "due" | "partial" | "done" | "overpaid" | null;

// Mesma leitura do banco (charge_settled, migração 0009), em centavos inteiros:
// quitada quando não há mais nada a cobrar; o excedente pago vira saldo a devolver.
// Total negativo é o inverso: o responsável deve ao passageiro, e o pagamento
// registrado (negativo) é a devolução feita. Toda tela decide por aqui.
export function chargeState(input: ChargeStateInput) {
  const cents = toCents(input.amount);
  const paidCents = toCents(input.paidAmount ?? 0);
  const closed = input.status === "closed";
  const settled = closed && input.paid;
  const isRefund = cents < 0;
  const hasObligation = cents !== 0 || paidCents !== 0;
  const partial = closed && !input.paid && paidCents !== 0 && (!isRefund || paidCents < 0);

  let refundCents = 0;
  let refundStatus: RefundStatus = null;
  if (closed && hasObligation) {
    if (isRefund && settled) {
      refundStatus = "done";
    } else if (isRefund) {
      refundCents = paidCents - cents;
      refundStatus = partial ? "partial" : "due";
    } else if (settled && paidCents > cents) {
      refundCents = paidCents - cents;
      refundStatus = "overpaid";
    }
  }

  return {
    cents,
    paidCents,
    outstandingCents: cents - paidCents,
    settled,
    partial,
    isRefund,
    refundStatus,
    refundCents,
    returnedCents: isRefund && paidCents < 0 ? -paidCents : 0,
    hasObligation,
  };
}

export type ChargeState = ReturnType<typeof chargeState>;

// Textos que dependem da direção do dinheiro: pagar (passageiro deve) ou devolver.
export function chargeTexts(state: ChargeState) {
  const { isRefund, partial, outstandingCents, refundCents } = state;
  return {
    payLabel: isRefund
      ? partial
        ? `Devolver ${formatCurrency(refundCents / 100)}`
        : "Marcar como devolvido"
      : partial
        ? `Pagar ${formatCurrency(outstandingCents / 100)}`
        : "Marcar como pago",
    unmarkLabel: isRefund ? "Desmarcar devolução" : "Desmarcar pagamento",
    settledText: isRefund ? "Devolução feita" : "Pagamento recebido",
  };
}
