import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  calculateMonthlyCharges,
  closeCycle,
  listChargePaymentEvents,
  listCycleCharges,
  listMonthlyCharges,
  listPaymentEventsForCharges,
  markMonthlyChargePaid,
  previewCycle,
  unmarkMonthlyChargePaid,
} from "@/services/monthlyCharges.service";

const monthlyChargesKey = ["monthlyCharges"] as const;

// Todas as cobranças do responsável (os ciclos são agrupados na tela).
export function useCycleCharges() {
  return usePrivateQuery({
    queryKey: [...monthlyChargesKey, "cycles"],
    queryFn: (scope) => listCycleCharges(scope),
  });
}

// Eventos de pagamento das cobranças carregadas, por id (não por mês de referência).
export function usePaymentEventsForCharges(chargeIds: string[]) {
  return usePrivateQuery({
    queryKey: [...monthlyChargesKey, "payments", "by-charges", chargeIds.join(",")],
    queryFn: (scope) => listPaymentEventsForCharges(chargeIds, scope),
    enabled: chargeIds.length > 0,
  });
}

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

// A prévia não grava nada; a tela cuida de descartar respostas de datas antigas.
export function usePreviewCycle() {
  return usePrivateMutation({
    mutationFn: (endDate: string, scope) => previewCycle(endDate, scope),
  });
}

export function useCloseCycle() {
  return usePrivateMutation({
    mutationFn: (endDate: string, scope) => closeCycle(endDate, scope),
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
