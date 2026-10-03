import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import type { FlaggedRide } from "@/types/entities";

const UNIQUE_VIOLATION = "23505";

export async function createRideFlag(
  rideId: string,
  scope?: SessionScope,
): Promise<void> {
  const userId = await getCurrentUserId(scope);

  const { error } = await supabase
    .from("ride_flags")
    .insert({
      ride_id: rideId,
      flagged_by: userId,
    })
    .abortSignal(requestSignal(scope));

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error("Esta diária já foi sinalizada.");
    }
    throw new Error(errorMessages.unexpected);
  }
}

export async function listUnresolvedFlags(scope?: SessionScope): Promise<FlaggedRide[]> {
  const { data: flags, error } = await supabase
    .from("ride_flags")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  if (flags.length === 0) {
    return [];
  }

  const rideIds = flags.map((flag) => flag.ride_id);

  const { data: rides, error: ridesError } = await supabase
    .from("rides")
    .select("*")
    .in("id", rideIds)
    .abortSignal(requestSignal(scope));

  if (ridesError) {
    throw new Error(errorMessages.unexpected);
  }

  const rideById = new Map(rides.map((ride) => [ride.id, ride]));

  return flags.map((flag) => {
    const ride = rideById.get(flag.ride_id);
    return {
      flagId: flag.id,
      rideId: flag.ride_id,
      passengerId: ride?.passenger_id ?? "",
      rideDate: ride?.ride_date ?? "",
      rateCharged: ride?.rate_charged ?? 0,
      createdAt: flag.created_at,
    };
  });
}

export async function resolveFlag(flagId: string, scope?: SessionScope): Promise<void> {
  const { error } = await supabase
    .from("ride_flags")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", flagId)
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }
}
