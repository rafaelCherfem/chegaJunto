import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SessionScope } from "@/lib/sessionScope";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});

export async function getCurrentUserId(scope?: SessionScope): Promise<string> {
  scope?.assertCurrent();
  const { data, error } = await supabase.auth.getUser();

  scope?.assertCurrent();
  if (error || !data.user || (scope && data.user.id !== scope.userId)) {
    throw new Error("Usuário não autenticado.");
  }

  return data.user.id;
}
