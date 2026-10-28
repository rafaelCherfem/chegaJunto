import { toCents } from "@/utils/money";

export type ChargeStatus = "closed" | "preview" | "outdated";

export interface ChargeStateInput {
  amount: number;
  paidAmount?: number | undefined;
  paid: boolean;
  status: ChargeStatus;
}

// Mesma leitura do banco (charge_settled, migração 0009), em centavos inteiros:
// quitada quando não há mais nada a cobrar; o excedente pago vira saldo a devolver.
export function chargeState(input: ChargeStateInput) {
  const cents = toCents(input.amount);
  const paidCents = toCents(input.paidAmount ?? 0);
  const closed = input.status === "closed";
  const settled = closed && input.paid;
  return {
    cents,
    paidCents,
    outstandingCents: cents - paidCents,
    settled,
    partial: closed && !input.paid && paidCents !== 0,
    refundCents: settled && cents >= 0 && paidCents > cents ? paidCents - cents : 0,
    hasObligation: cents !== 0 || paidCents !== 0,
  };
}
