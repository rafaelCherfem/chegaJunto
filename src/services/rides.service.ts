import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { assertRecordDate, FUTURE_DATE_ERROR, monthBounds } from "@/utils/date";
import { errorMessages } from "@/constants/errorMessages";
import { toRide } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import { getPassenger } from "@/services/passengers.service";
import type { Ride } from "@/types/entities";

const UNIQUE_VIOLATION = "23505";

export interface CreateRideInput {
  passengerId: string;
  rideDate: string;
}

export async function listRidesByMonth(
  referenceMonth: string,
  passengerId?: string,
  scope?: SessionScope,
): Promise<Ride[]> {
  const { start: monthStart, end: monthEnd } = monthBounds(referenceMonth);

  let query = supabase
    .from("rides")
    .select("*")
    .gte("ride_date", monthStart)
    .lt("ride_date", monthEnd)
    .order("ride_date");

  if (passengerId) {
    query = query.eq("passenger_id", passengerId);
  }

  const { data, error } = await query.abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toRide);
}

export async function createRide(
  input: CreateRideInput,
  scope?: SessionScope,
): Promise<Ride> {
  assertRecordDate(input.rideDate);
  const userId = await getCurrentUserId(scope);
  const passenger = await getPassenger(input.passengerId, scope);
  scope?.assertCurrent();

  const { data, error } = await supabase
    .from("rides")
    .insert({
      user_id: userId,
      passenger_id: input.passengerId,
      ride_date: input.rideDate,
      rate_charged: passenger.defaultDailyRate,
    })
    .select("*")
    .abortSignal(requestSignal(scope))
    .single();

  if (error) {
    if (error.code === "23514" && error.message.includes("FUTURE_DATE"))
      throw new Error(FUTURE_DATE_ERROR);
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(errorMessages.duplicateRide);
    }
    throw new Error(errorMessages.unexpected);
  }

  return toRide(data);
}

export async function deleteRide(id: string, scope?: SessionScope): Promise<void> {
  const { error } = await supabase
    .from("rides")
    .delete()
    .eq("id", id)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}
