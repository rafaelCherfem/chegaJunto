import { RideLedgerBrand } from "@/components/brand/RideLedgerBrand";
import { RouteDecoration } from "@/components/brand/RouteDecoration";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginFormValues } from "@/schemas/auth.schema";
import { signInWithPassword } from "@/services/auth.service";

export function LoginPage() {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);

    try {
      await signInWithPassword(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível entrar.");
    }
  }

  return (
    <main className="login-layout">
      <RouteDecoration />
      <header className="space-y-6 lg:space-y-10">
        <RideLedgerBrand className="text-2xl" />
        <div className="hidden space-y-5 lg:block">
          <p className="max-w-xs text-3xl font-medium leading-tight tracking-tight">
            Seu registro de caronas.
          </p>
          <p className="max-w-xs text-base leading-7 text-muted-foreground">
            Diárias, compensações e fechamento mensal.
          </p>
          <div className="h-px w-12 bg-[hsl(var(--identity))]" aria-hidden="true" />
        </div>
      </header>

      <section className="login-form" aria-labelledby="login-title">
        <h1 id="login-title" className="text-2xl font-semibold tracking-tight">
          Entrar
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="login-email-error" role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p
                id="login-password-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
