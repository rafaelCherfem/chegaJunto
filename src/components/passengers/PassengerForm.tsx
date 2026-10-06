import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passengerSchema, type PassengerFormValues } from "@/schemas/passenger.schema";
import type { Passenger } from "@/types/entities";

interface PassengerFormProps {
  initialValues?: Passenger | undefined;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: PassengerFormValues) => void;
  onCancel: () => void;
}

export function PassengerForm({
  initialValues,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: PassengerFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PassengerFormValues>({
    resolver: zodResolver(passengerSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      defaultDailyRate: initialValues?.defaultDailyRate ?? 0,
    },
  });

  useEffect(() => {
    reset({
      name: initialValues?.name ?? "",
      defaultDailyRate: initialValues?.defaultDailyRate ?? 0,
    });
  }, [initialValues, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-panel">
      <div className="space-y-1">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "passenger-name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p id="passenger-name-error" role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="defaultDailyRate">Valor da diária</Label>
        <Input
          id="defaultDailyRate"
          aria-invalid={Boolean(errors.defaultDailyRate)}
          aria-describedby={errors.defaultDailyRate ? "passenger-rate-error" : undefined}
          type="number"
          step="0.01"
          inputMode="decimal"
          {...register("defaultDailyRate")}
        />
        {errors.defaultDailyRate && (
          <p id="passenger-rate-error" role="alert" className="text-sm text-destructive">
            {errors.defaultDailyRate.message}
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
