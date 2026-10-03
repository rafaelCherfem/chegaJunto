import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CarIllustration } from "@/components/illustrations/CarIllustration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  inviteSignupSchema,
  type InviteSignupFormValues,
} from "@/schemas/inviteSignup.schema";
import { signInWithPassword, signOut, signUpWithPassword } from "@/services/auth.service";
import { redeemPassengerInvite } from "@/services/passengerAccounts.service";

import { forgetInvite, recalledInvite, rememberInvite } from "@/utils/pendingInvite";

export function InviteRedemptionPage() {
  const { code: legacyCode } = useParams<{ code: string }>();
  const location = useLocation();
  const code =
    new URLSearchParams(location.hash.slice(1)).get("token") ??
    legacyCode ??
    recalledInvite();
  const { user, loading, getScope } = useAuth();
  const navigate = useNavigate();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [loginMode, setLoginMode] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  async function redeem() {
    if (!code || !/^[0-9a-f]{64}$/.test(code)) {
      setSubmitError("Convite inválido.");
      return;
    }
    const scope = getScope();
    setRedeeming(true);
    setSubmitError(null);
    try {
      scope.assertCurrent();
      await redeemPassengerInvite(code, scope);
      scope.assertCurrent();
      forgetInvite();
      navigate("/", { replace: true });
    } catch (error) {
      if (!scope.signal.aborted)
        setSubmitError(
          error instanceof Error ? error.message : "Falha temporária. Tente novamente.",
        );
    } finally {
      if (!scope.signal.aborted) setRedeeming(false);
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignupFormValues>({
    resolver: zodResolver(inviteSignupSchema),
  });

  async function onSubmit(values: InviteSignupFormValues) {
    setSubmitError(null);

    if (!code || !/^[0-9a-f]{64}$/.test(code)) {
      setSubmitError("Link de convite inválido.");
      return;
    }

    rememberInvite(code);
    try {
      const hasSession = await signUpWithPassword(
        values,
        async (session) => {
          const scope = getScope();
          scope.assertCurrent();
          if (scope.userId !== session.user.id) throw new Error("A sessão mudou.");
          await redeemPassengerInvite(code, scope);
          scope.assertCurrent();
          forgetInvite();
          navigate("/", { replace: true });
        },
        `${window.location.origin}/convite`,
      );

      if (!hasSession) {
        setPendingConfirmation(true);
        return;
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não foi possível concluir o cadastro.",
      );
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    const form = new FormData(event.currentTarget);
    if (code) rememberInvite(code);
    try {
      await signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Falha temporária.");
    }
  }
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm opacity-70">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <CarIllustration />
        <div className="surface mt-8 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">RideLedger</h1>
          <p className="mt-1 text-sm opacity-70">
            Use o convite para acompanhar suas diárias.
          </p>

          {user ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm">
                Você já está logado como <strong>{user.email}</strong>.
              </p>
              <p className="text-sm opacity-70">
                Confirme para vincular esta conta ao convite.
              </p>
              <Button disabled={redeeming} onClick={redeem}>
                {redeeming ? "Vinculando..." : "Usar convite"}
              </Button>
              {submitError && <p role="alert">{submitError}</p>}
              <Button variant="outline" onClick={() => signOut()}>
                Sair
              </Button>
            </div>
          ) : pendingConfirmation ? (
            <div className="mt-6 space-y-2">
              <p className="text-sm">
                Quase lá — confirme seu e-mail para ativar a conta.
              </p>
              <p className="text-sm opacity-70">
                Após confirmar, retorne a esta página e use o convite. Se abrir em outro
                navegador, reabra o link original.
              </p>
              <Button
                onClick={() => {
                  setPendingConfirmation(false);
                  setLoginMode(true);
                }}
              >
                Já confirmei: entrar
              </Button>
            </div>
          ) : loginMode ? (
            <form onSubmit={login} className="mt-6 space-y-4">
              <Label htmlFor="login-email">E-mail</Label>
              <Input id="login-email" name="email" type="email" required />
              <Label htmlFor="login-password">Senha</Label>
              <Input id="login-password" name="password" type="password" required />
              {submitError && <p role="alert">{submitError}</p>}
              <Button type="submit">Entrar</Button>
              <Button type="button" variant="outline" onClick={() => setLoginMode(false)}>
                Criar conta
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {submitError && <p className="text-xs text-destructive">{submitError}</p>}

              <Button type="button" variant="outline" onClick={() => setLoginMode(true)}>
                Já tenho conta
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Criando conta..." : "Criar conta"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
