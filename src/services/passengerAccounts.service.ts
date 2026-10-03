import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { toPassengerInvite } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import { generateInviteCode } from "@/utils/inviteCode";
import type { PassengerInvite } from "@/types/entities";

export async function createPassengerInvite(
  passengerId: string,
  scope?: SessionScope,
): Promise<PassengerInvite> {
  const userId = await getCurrentUserId(scope);
  const code = generateInviteCode();

  const { data, error } = await supabase
    .from("passenger_invites")
    .insert({
      passenger_id: passengerId,
      owner_user_id: userId,
      code,
    })
    .select("*")
    .abortSignal(requestSignal(scope))
    .single();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return toPassengerInvite(data);
}

export async function listPassengerInvites(
  passengerId: string,
  scope?: SessionScope,
): Promise<PassengerInvite[]> {
  const { data, error } = await supabase
    .from("passenger_invites")
    .select("*")
    .eq("passenger_id", passengerId)
    .order("created_at", { ascending: false })
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data.map(toPassengerInvite);
}

export async function redeemPassengerInvite(
  code: string,
  scope?: SessionScope,
): Promise<void> {
  const { error } = await supabase
    .rpc("redeem_passenger_invite", {
      invite_code: code,
    })
    .abortSignal(requestSignal(scope));

  if (error) {
    throw new Error("Código inválido ou já utilizado.");
  }
}

export async function getMyPassengerAccount(scope?: SessionScope): Promise<{
  passengerId: string;
} | null> {
  const userId = await getCurrentUserId(scope);

  const { data, error } = await supabase
    .from("passenger_accounts")
    .select("passenger_id")
    .eq("user_id", userId)
    .abortSignal(requestSignal(scope))
    .maybeSingle();

  if (error) {
    throw new Error(errorMessages.unexpected);
  }

  return data ? { passengerId: data.passenger_id } : null;
}
