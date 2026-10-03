import { assertReferenceMonth } from "@/utils/date";
import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { toMonthlyCharge } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import { listReceivedRidesByMonth } from "@/services/receivedRides.service";
import { listRidesByMonth } from "@/services/rides.service";
import type { MonthlyCharge } from "@/types/entities";
import { totalsByPassenger as calculateTotalsByPassenger } from "@/utils/monthlyTotals";

export async function calculateMonthlyCharges(
  referenceMonth: string,
  scope?: SessionScope,
): Promise<MonthlyCharge[]> {
  assertReferenceMonth(referenceMonth);
  const userId = await getCurrentUserId(scope);
  const [rides, receivedRides] = await Promise.all([
    listRidesByMonth(referenceMonth, undefined, scope),
    listReceivedRidesByMonth(referenceMonth, undefined, scope),
  ]);
  scope?.assertCurrent();

  const totalsByPassenger = calculateTotalsByPassenger(rides, receivedRides);

  if (totalsByPassenger.size === 0) {
    return [];
  }

  const upserts = Array.from(totalsByPassenger.entries()).map(
    ([passengerId, totalAmount]) => ({
      user_id: userId,
      passenger_id: passengerId,
      reference_month: referenceMonth,
      total_amount: totalAmount,
    }),
  );

  const { data, error } = await supabase
    .from("monthly_charges")
    .upsert(upserts, { onConflict: "passenger_id,reference_month" })
    .select("*")
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toMonthlyCharge);
}

export async function listMonthlyCharges(
  referenceMonth: string,
  scope?: SessionScope,
): Promise<MonthlyCharge[]> {
  assertReferenceMonth(referenceMonth);
  const { data, error } = await supabase
    .from("monthly_charges")
    .select("*")
    .eq("reference_month", referenceMonth)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toMonthlyCharge);
}

export async function markMonthlyChargePaid(
  id: string,
  amount: number,
  scope?: SessionScope,
): Promise<MonthlyCharge> {
  const { data, error } = await supabase
    .from("monthly_charges")
    .update({
      paid: true,
      paid_amount: amount,
      paid_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .abortSignal(requestSignal(scope))
    .maybeSingle();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  if (!data) {
    throw new Error(errorMessages.monthlyChargeNotFound);
  }

  return toMonthlyCharge(data);
}

export async function unmarkMonthlyChargePaid(
  id: string,
  scope?: SessionScope,
): Promise<MonthlyCharge> {
  const { data, error } = await supabase
    .from("monthly_charges")
    .update({
      paid: false,
      paid_amount: 0,
      paid_at: null,
    })
    .eq("id", id)
    .select("*")
    .abortSignal(requestSignal(scope))
    .maybeSingle();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  if (!data) {
    throw new Error(errorMessages.monthlyChargeNotFound);
  }

  return toMonthlyCharge(data);
}
