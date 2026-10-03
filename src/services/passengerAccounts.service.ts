import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { errorMessages } from "@/constants/errorMessages";
import { toPassengerInvite } from "@/lib/mappers";
import { getCurrentUserId, supabase } from "@/lib/supabase";
import { generateInviteCode } from "@/utils/inviteCode";
import type { PassengerInvite } from "@/types/entities";

const inviteErrors: Record<string, string> = {
  INVITE_INVALID: "Convite inválido.",
  INVITE_EXPIRED: "Convite expirado.",
  INVITE_REVOKED: "Convite revogado.",
  INVITE_USED: "Convite já utilizado.",
  ACCOUNT_INCOMPATIBLE: "Esta conta já possui um papel ou vínculo incompatível.",
  SESSION_REQUIRED: "Entre na sua conta para usar o convite.",
};
function inviteError(error: { message: string; code?: string }): Error {
  return new Error(
    inviteErrors[error.message] ??
      (error.code === "23505"
        ? inviteErrors.ACCOUNT_INCOMPATIBLE
        : "Falha temporária. Tente novamente."),
  );
}
async function safeInviteRequest<T>(request: PromiseLike<T>): Promise<T> {
  try {
    return await request;
  } catch {
    throw new Error("Falha temporária. Tente novamente.");
  }
}

export async function createPassengerInvite(
  passengerId: string,
  scope?: SessionScope,
): Promise<{ id: string; token: string }> {
  await getCurrentUserId(scope);
  const token = generateInviteCode();
  const { data, error } = await safeInviteRequest(
    supabase
      .rpc("create_passenger_invite", {
        target_passenger: passengerId,
        invite_token: token,
      })
      .abortSignal(requestSignal(scope)),
  );
  scope?.assertCurrent();
  if (error) throw inviteError(error);
  return { id: data, token };
}
export async function revokePassengerInvite(
  id: string,
  scope?: SessionScope,
): Promise<void> {
  await getCurrentUserId(scope);
  const { error } = await safeInviteRequest(
    supabase
      .rpc("revoke_passenger_invite", { target_invite: id })
      .abortSignal(requestSignal(scope)),
  );
  scope?.assertCurrent();
  if (error) throw inviteError(error);
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
  await getCurrentUserId(scope);
  const { error } = await safeInviteRequest(
    supabase
      .rpc("redeem_passenger_invite", {
        invite_code: code,
      })
      .abortSignal(requestSignal(scope)),
  );

  scope?.assertCurrent();
  if (error) throw inviteError(error);
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
