import type { ChargePaymentEvent } from "@/types/entities";
import { addCents, toCents } from "@/utils/money";

// Same rule as public.charge_live_payments (migration 0010): uncancelled
// payments, newest first, until the running sum matches the amount received.
// The database still has the final word when cancelling.
export function latestOpenPayment(
  events: ReadonlyArray<ChargePaymentEvent>,
  chargeId: string,
  paidAmount: number,
): string | null {
  const paidCents = toCents(paidAmount);
  if (paidCents === 0) return null;

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
  for (const payment of openPayments) {
    runningTotal = addCents(runningTotal, toCents(payment.signedAmount));
    if (runningTotal === paidCents) return openPayments[0]!.id;
  }
  return null;
}
