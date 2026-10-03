import { assertReferenceMonth } from "@/utils/date";
import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { toMonthlyCharge } from "@/lib/mappers";
import { supabase } from "@/lib/supabase";
import type { MonthlyCharge } from "@/types/entities";
function financialError(error: { code?: string; message?: string }): Error {
  if (error.code === "40001") return new Error("A cobrança mudou. Atualize os dados e repita a operação.");
  if (error.code === "23514" && error.message === "NO_OBLIGATION") return new Error("Nenhum valor pendente para registrar pagamento.");
  return new Error(errorMessages.unexpected);
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
