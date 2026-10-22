import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  calculateMonthlyCharges,
  listChargePaymentEvents,
  listMonthlyCharges,
  markMonthlyChargePaid,
  unmarkMonthlyChargePaid,
} from "@/services/monthlyCharges.service";

const monthlyChargesKey = ["monthlyCharges"] as const;

export function useMonthlyCharges(referenceMonth: string) {
  return usePrivateQuery({
    queryKey: [...monthlyChargesKey, referenceMonth],
    queryFn: (scope) => listMonthlyCharges(referenceMonth, scope),
  });
}

export function useChargePaymentEvents(referenceMonth: string) {
  return usePrivateQuery({
    queryKey: [...monthlyChargesKey, referenceMonth, "payments"],
    queryFn: (scope) => listChargePaymentEvents(referenceMonth, scope),
  });
}

export function useCalculateMonthlyCharges() {
  return usePrivateMutation({
    mutationFn: (referenceMonth: string, scope) =>
      calculateMonthlyCharges(referenceMonth, scope),
    invalidate: monthlyChargesKey,
  });
}

export function useMarkMonthlyChargePaid() {
  return usePrivateMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }, scope) =>
      markMonthlyChargePaid(id, revision, scope),
    invalidate: monthlyChargesKey,
  });
}

export function useUnmarkMonthlyChargePaid() {
  return usePrivateMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }, scope) => unmarkMonthlyChargePaid(id, paymentId, scope),
    invalidate: monthlyChargesKey,
  });
}
