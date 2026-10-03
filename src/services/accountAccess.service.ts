import { requestSignal, type SessionScope } from "@/lib/sessionScope";
import { getCurrentUserId, supabase } from "@/lib/supabase";

export type AccountAccess =
  | { role: "responsible" }
  | { role: "passenger"; passengerId: string }
  | { role: "unlinked" };

export async function getMyAccountAccess(scope?: SessionScope): Promise<AccountAccess> {
  const userId = await getCurrentUserId(scope);
  const [responsible, passenger] = await Promise.all([
    supabase
      .from("responsible_accounts")
      .select("user_id")
      .eq("user_id", userId)
      .abortSignal(requestSignal(scope))
      .maybeSingle(),
    supabase
      .from("passenger_accounts")
      .select("passenger_id")
      .eq("user_id", userId)
      .abortSignal(requestSignal(scope))
      .maybeSingle(),
  ]);
  if (responsible.error || passenger.error) {
    throw new Error("Não foi possível verificar o acesso da conta.");
  }
  if (responsible.data && passenger.data) {
    throw new Error("A conta possui papéis incompatíveis.");
  }
  if (responsible.data) return { role: "responsible" };
  if (passenger.data)
    return { role: "passenger", passengerId: passenger.data.passenger_id };
  return { role: "unlinked" };
}
