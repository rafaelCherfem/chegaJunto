import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { addMonths, formatISO } from "date-fns";
import { errorMessages } from "@/constants/errorMessages";
import { toReceivedRide } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import type { ReceivedRide } from "@/types/entities";

export interface CreateReceivedRideInput {
  passengerId: string;
  receivedDate: string;
  amount: number;
}

export async function listReceivedRidesByMonth(
  referenceMonth: string,
  passengerId?: string,
  scope?: SessionScope,
): Promise<ReceivedRide[]> {
  const monthStart = referenceMonth;
  const monthEnd = formatISO(addMonths(new Date(referenceMonth), 1), {
    representation: "date",
  });

  let query = supabase
    .from("received_rides")
    .select("*")
    .gte("received_date", monthStart)
    .lt("received_date", monthEnd)
    .order("received_date");

  if (passengerId) {
    query = query.eq("passenger_id", passengerId);
  }

  const { data, error } = await query.abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toReceivedRide);
}

export async function createReceivedRide(
  input: CreateReceivedRideInput,
  scope?: SessionScope,
): Promise<ReceivedRide> {
  const userId = await getCurrentUserId(scope);

  const { data, error } = await supabase
    .from("received_rides")
    .insert({
      user_id: userId,
      passenger_id: input.passengerId,
      received_date: input.receivedDate,
      amount: input.amount,
    })
    .select("*")
    .abortSignal(requestSignal(scope))
    .single();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return toReceivedRide(data);
}

export async function deleteReceivedRide(
  id: string,
  scope?: SessionScope,
): Promise<void> {
  const { error } = await supabase
    .from("received_rides")
    .delete()
    .eq("id", id)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}
