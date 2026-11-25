import type { ChargePaymentEvent } from "@/types/entities";
import { formatDateDisplay, isoDateFromTimestamp } from "@/utils/date";
import { addCents, toCents } from "@/utils/money";

// Data (dd/mm/aaaa, fuso de São Paulo) em que o pagamento foi gravado.
export function paymentDate(occurredAt: string): string {
  return formatDateDisplay(isoDateFromTimestamp(occurredAt));
}

// Same rule as public.charge_live_payments (migration 0010): uncancelled
// payments, newest first, until the running sum matches the amount received.
// The returned list is the window from the newest payment down to the first
// point where the sum closes (newest first). The database still has the final
// word when cancelling.
export function livePayments(
  events: ReadonlyArray<ChargePaymentEvent>,
  chargeId: string,
  paidAmount: number,
): ChargePaymentEvent[] {
  const paidCents = toCents(paidAmount);
  if (paidCents === 0) return [];

  const cancelled = new Set(
    events
      .filter((event) => event.monthlyChargeId === chargeId && event.kind === "CANCEL")
      .map((event) => event.relatedPaymentId),
  );
  const openPayments = events
    .filter(
      (event) =>
        event.monthlyChargeId === chargeId &&
        event.kind === "PAYMENT" &&
        !cancelled.has(event.id),
    )
    .sort((a, b) => b.revision - a.revision);

  let runningTotal = 0;
  for (const [index, payment] of openPayments.entries()) {
    runningTotal = addCents(runningTotal, toCents(payment.signedAmount));
    if (runningTotal === paidCents) return openPayments.slice(0, index + 1);
  }
  return [];
}

// O pagamento vigente mais recente (o que o "Desfazer" cancela).
export function latestOpenPaymentEvent(
  events: ReadonlyArray<ChargePaymentEvent>,
  chargeId: string,
  paidAmount: number,
): ChargePaymentEvent | null {
  return livePayments(events, chargeId, paidAmount)[0] ?? null;
}

// Só o id do pagamento que o "Desfazer" cancela (o vigente mais recente).
export function latestOpenPayment(
  events: ReadonlyArray<ChargePaymentEvent>,
  chargeId: string,
  paidAmount: number,
): string | null {
  return latestOpenPaymentEvent(events, chargeId, paidAmount)?.id ?? null;
}
