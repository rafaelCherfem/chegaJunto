import { assertCalendarDate, assertReferenceMonth } from "@/utils/date";
import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { loadErrorFrom } from "@/lib/loadErrors";
import { mapCycleError } from "@/lib/cycleErrors";
import { toChargePaymentEvent, toCycleSummaryRow, toMonthlyCharge } from "@/lib/mappers";
import { supabase } from "@/lib/supabase";
import type { ChargePaymentEvent, CycleSummaryRow, MonthlyCharge } from "@/types/entities";
function financialError(error: { code?: string; message?: string; hint?: string | null }): Error {
  if (error.code === "40001") return new Error("A cobrança mudou. Atualize os dados e repita a operação.");
  if (error.code === "23514" && error.message === "NO_OBLIGATION") return new Error("Nenhum valor pendente para registrar pagamento.");
  return mapCycleError(error) ?? new Error(errorMessages.unexpected);
}
// Quantos ids de cobrança vão em cada consulta de eventos (limite de tamanho da URL).
const EVENT_CHUNK = 100;
export async function closeCycle(endDate: string, scope?: SessionScope): Promise<CycleSummaryRow[]> {
  assertCalendarDate(endDate);
  const signal = requestSignal(scope);
  const { data, error } = await supabase.rpc("close_cycle", { end_date: endDate }).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw financialError(error);
  return data.map(toCycleSummaryRow);
}
// Mesmas validações e permissões do closeCycle, sem gravar nada.
export async function previewCycle(endDate: string, scope?: SessionScope): Promise<CycleSummaryRow[]> {
  assertCalendarDate(endDate);
  const signal = requestSignal(scope);
  const { data, error } = await supabase.rpc("preview_cycle", { end_date: endDate }).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw financialError(error);
  return data.map(toCycleSummaryRow);
}
// Todas as cobranças do responsável, do ciclo mais recente para o mais antigo.
export async function listCycleCharges(scope?: SessionScope): Promise<MonthlyCharge[]> {
  const signal = requestSignal(scope);
  const { data, error } = await supabase.from("monthly_charges").select("*").order("period_end", { ascending: false }).order("period_start", { ascending: false }).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw loadErrorFrom(error);
  return data.map(toMonthlyCharge);
}
// Eventos de pagamento das cobranças dadas (por id, não por mês de referência).
export async function listPaymentEventsForCharges(chargeIds: string[], scope?: SessionScope): Promise<ChargePaymentEvent[]> {
  const signal = requestSignal(scope);
  const events: ChargePaymentEvent[] = [];
  for (let from = 0; from < chargeIds.length; from += EVENT_CHUNK) {
    const { data, error } = await supabase.from("monthly_charge_events").select("id,monthly_charge_id,kind,revision,signed_amount,related_payment_id").in("monthly_charge_id", chargeIds.slice(from, from + EVENT_CHUNK)).in("kind", ["PAYMENT", "CANCEL"]).abortSignal(signal);
    scope?.assertCurrent();
    if (error) throw new Error(errorMessages.unexpected);
    events.push(...data.map(toChargePaymentEvent));
  }
  return events;
}
export async function calculateMonthlyCharges(referenceMonth: string, scope?: SessionScope): Promise<MonthlyCharge[]> {
  assertReferenceMonth(referenceMonth);
  const signal = requestSignal(scope);
  const { data, error } = await supabase.rpc("close_month", { month_date: referenceMonth }).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw financialError(error);
  return data.map(toMonthlyCharge);
}
export async function listMonthlyCharges(referenceMonth: string, scope?: SessionScope): Promise<MonthlyCharge[]> {
  assertReferenceMonth(referenceMonth);
  const signal = requestSignal(scope);
  const { data, error } = await supabase.from("monthly_charges").select("*").eq("reference_month", referenceMonth).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw new Error(errorMessages.unexpected);
  return data.map(toMonthlyCharge);
}
export async function listChargePaymentEvents(referenceMonth: string, scope?: SessionScope): Promise<ChargePaymentEvent[]> {
  assertReferenceMonth(referenceMonth);
  const signal = requestSignal(scope);
  const { data, error } = await supabase.from("monthly_charge_events").select("id,monthly_charge_id,kind,revision,signed_amount,related_payment_id").eq("reference_month", referenceMonth).in("kind", ["PAYMENT", "CANCEL"]).abortSignal(signal);
  scope?.assertCurrent();
  if (error) throw new Error(errorMessages.unexpected);
  return data.map(toChargePaymentEvent);
}
export async function markMonthlyChargePaid(id: string, revision: number, scope?: SessionScope): Promise<MonthlyCharge> {
  const signal = requestSignal(scope);
  const { data, error } = await supabase.rpc("pay_charge", { target_charge: id, expected_revision: revision }).abortSignal(signal).single();
  scope?.assertCurrent();
  if (error) throw financialError(error);
  return toMonthlyCharge(data);
}
export async function unmarkMonthlyChargePaid(id: string, paymentId: string, scope?: SessionScope): Promise<MonthlyCharge> {
  const signal = requestSignal(scope);
  const { data, error } = await supabase.rpc("cancel_charge_payment", { target_charge: id, target_payment: paymentId }).abortSignal(signal).single();
  scope?.assertCurrent();
  if (error) throw financialError(error);
  return toMonthlyCharge(data);
}
