import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface SignInInput {
  email: string;
  password: string;
}

export async function signInWithPassword(input: SignInInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    throw new Error("E-mail ou senha inválidos.");
  }
}

export interface SignUpInput {
  email: string;
  password: string;
}

export async function signUpWithPassword(
  input: SignUpInput,
  onSession?: (session: Session) => Promise<void>,
): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp(input);

  if (error) {
    throw new Error(
      error.message.includes("already registered")
        ? "Este e-mail já tem uma conta. Faça login em vez de cadastrar."
        : "Não foi possível criar a conta.",
    );
  }

  if (data.session && onSession) await onSession(data.session);
  return data.session !== null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
