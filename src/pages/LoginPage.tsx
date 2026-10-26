import { BrandLogo } from "@/components/brand/BrandLogo";
import { LoginBackdrop } from "@/components/brand/LoginBackdrop";
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
      <LoginBackdrop />
      <header className="space-y-6">
        <BrandLogo className="brand-logo--hero" />
        <p className="login-tagline hidden max-w-xs text-3xl leading-tight lg:block">
          Seu registro de caronas.
        </p>
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
