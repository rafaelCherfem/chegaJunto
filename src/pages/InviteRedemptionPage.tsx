import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { CarIllustration } from "@/components/illustrations/CarIllustration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  inviteSignupSchema,
  type InviteSignupFormValues,
} from "@/schemas/inviteSignup.schema";
import { signOut, signUpWithPassword } from "@/services/auth.service";
import { redeemPassengerInvite } from "@/services/passengerAccounts.service";

export function InviteRedemptionPage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading, getScope } = useAuth();
  const navigate = useNavigate();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignupFormValues>({
    resolver: zodResolver(inviteSignupSchema),
  });

  async function onSubmit(values: InviteSignupFormValues) {
    setSubmitError(null);

    if (!code) {
      setSubmitError("Link de convite inválido.");
      return;
    }

    try {
      const hasSession = await signUpWithPassword(values, async (session) => {
        const scope = getScope();
        scope.assertCurrent();
        if (scope.userId !== session.user.id) throw new Error("A sessão mudou.");
        await redeemPassengerInvite(code, scope);
        scope.assertCurrent();
        navigate("/", { replace: true });
      });

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
            Crie sua conta para acompanhar suas diárias.
          </p>

          {user ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm">
                Você já está logado como <strong>{user.email}</strong>.
              </p>
              <p className="text-sm opacity-70">
                Saia da conta atual para usar este código de convite.
              </p>
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
                Depois de confirmar, acesse este mesmo link de convite de novo para
                concluir o vínculo.
              </p>
            </div>
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
