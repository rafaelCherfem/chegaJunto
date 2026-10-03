import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { toPassenger } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import type { Passenger } from "@/types/entities";
import { toCents } from "@/utils/money";

export interface CreatePassengerInput {
  name: string;
  defaultDailyRate: number;
}

export interface UpdatePassengerInput {
  name?: string;
  defaultDailyRate?: number;
}

export async function listPassengers(
  includeInactive = false,
  scope?: SessionScope,
): Promise<Passenger[]> {
  let query = supabase.from("passengers").select("*").order("name");

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toPassenger);
}

export async function getPassenger(id: string, scope?: SessionScope): Promise<Passenger> {
  const { data, error } = await supabase
    .from("passengers")
    .select("*")
    .eq("id", id)
    .abortSignal(requestSignal(scope))
    .maybeSingle();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  if (!data) {
    throw new Error(errorMessages.passengerNotFound);
  }

  return toPassenger(data);
}

export async function createPassenger(
  input: CreatePassengerInput,
  scope?: SessionScope,
): Promise<Passenger> {
  toCents(input.defaultDailyRate);
  const userId = await getCurrentUserId(scope);

  const { data, error } = await supabase
    .from("passengers")
    .insert({
      user_id: userId,
      name: input.name,
      default_daily_rate: input.defaultDailyRate,
    })
    .select("*")
    .abortSignal(requestSignal(scope))
    .single();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return toPassenger(data);
}

export async function updatePassenger(
  id: string,
  input: UpdatePassengerInput,
  scope?: SessionScope,
): Promise<Passenger> {
  if (input.defaultDailyRate !== undefined) toCents(input.defaultDailyRate);
  const { data, error } = await supabase
    .from("passengers")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.defaultDailyRate !== undefined && {
        default_daily_rate: input.defaultDailyRate,
      }),
    })
    .eq("id", id)
    .select("*")
    .abortSignal(requestSignal(scope))
    .maybeSingle();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  if (!data) {
    throw new Error(errorMessages.passengerNotFound);
  }

  return toPassenger(data);
}

export async function setPassengerActive(
  id: string,
  active: boolean,
  scope?: SessionScope,
): Promise<void> {
  const { error } = await supabase
    .from("passengers")
    .update({ active })
    .eq("id", id)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}

export async function deletePassenger(id: string, scope?: SessionScope): Promise<void> {
  const [rides, charges, receivedRides] = await Promise.all([
    supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id)
      .abortSignal(requestSignal(scope)),
    supabase
      .from("monthly_charges")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id)
      .abortSignal(requestSignal(scope)),
    supabase
      .from("received_rides")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id)
      .abortSignal(requestSignal(scope)),
  ]);

  if (rides.error || charges.error || receivedRides.error) {
    throw new Error(errorMessages.unexpected);
  }

  scope?.assertCurrent();

  const hasHistory =
    (rides.count ?? 0) > 0 || (charges.count ?? 0) > 0 || (receivedRides.count ?? 0) > 0;

  if (hasHistory) {
    throw new Error(
      "Este passageiro já tem diárias, cobranças ou compensações registradas — exclusão bloqueada. Desative-o em vez disso.",
    );
  }

  const { error } = await supabase
    .from("passengers")
    .delete()
    .eq("id", id)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}
