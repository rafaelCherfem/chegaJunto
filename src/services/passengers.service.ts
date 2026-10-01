import { errorMessages } from "@/constants/errorMessages";
import { toPassenger } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import type { Passenger } from "@/types/entities";

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
): Promise<Passenger[]> {
  let query = supabase.from("passengers").select("*").order("name");

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toPassenger);
}

export async function getPassenger(id: string): Promise<Passenger> {
  const { data, error } = await supabase
    .from("passengers")
    .select("*")
    .eq("id", id)
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
): Promise<Passenger> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("passengers")
    .insert({
      user_id: userId,
      name: input.name,
      default_daily_rate: input.defaultDailyRate,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return toPassenger(data);
}

export async function updatePassenger(
  id: string,
  input: UpdatePassengerInput,
): Promise<Passenger> {
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
): Promise<void> {
  const { error } = await supabase
    .from("passengers")
    .update({ active })
    .eq("id", id);

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}

export async function deletePassenger(id: string): Promise<void> {
  const [rides, charges, receivedRides] = await Promise.all([
    supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id),
    supabase
      .from("monthly_charges")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id),
    supabase
      .from("received_rides")
      .select("id", { count: "exact", head: true })
      .eq("passenger_id", id),
  ]);

  if (rides.error || charges.error || receivedRides.error) {
    throw new Error(errorMessages.unexpected);
  }

  const hasHistory =
    (rides.count ?? 0) > 0 ||
    (charges.count ?? 0) > 0 ||
    (receivedRides.count ?? 0) > 0;

  if (hasHistory) {
    throw new Error(
      "Este passageiro já tem diárias, cobranças ou compensações registradas — exclusão bloqueada. Desative-o em vez disso.",
    );
  }

  const { error } = await supabase.from("passengers").delete().eq("id", id);

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}
