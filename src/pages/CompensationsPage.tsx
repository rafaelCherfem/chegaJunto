import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePassengers } from "@/hooks/usePassengers";
import {
  useCreateReceivedRide,
  useDeleteReceivedRide,
  useReceivedRidesByMonth,
} from "@/hooks/useReceivedRides";
import {
  receivedRideSchema,
  type ReceivedRideFormValues,
} from "@/schemas/receivedRide.schema";
import {
  currentMonthStart,
  isCalendarDate,
  referenceMonthFromDate,
  formatDateDisplay,
  todayISODate,
  formatMonthLabel,
} from "@/utils/date";
import { formatCurrency } from "@/utils/currency";
import type { ReceivedRide } from "@/types/entities";

export function CompensationsPage() {
  const { data: passengers } = usePassengers();

  const createReceivedRide = useCreateReceivedRide();
  const deleteReceivedRide = useDeleteReceivedRide();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReceivedRideFormValues>({
    resolver: zodResolver(receivedRideSchema),
    defaultValues: {
      passengerId: "",
      receivedDate: todayISODate(),
      amount: 0,
    },
  });

  const selectedDate = watch("receivedDate");
  const validDate = isCalendarDate(selectedDate);
  const referenceMonth = validDate
    ? referenceMonthFromDate(selectedDate)
    : currentMonthStart();
  const {
    data: receivedRides,
    isLoading,
    isError,
  } = useReceivedRidesByMonth(
    referenceMonth,
    validDate && selectedDate <= todayISODate(),
  );

  const passengerNames: Record<string, string> = {};
  for (const passenger of passengers ?? []) {
    passengerNames[passenger.id] = passenger.name;
  }

  async function onSubmit(values: ReceivedRideFormValues) {
    setSubmitError(null);

    try {
      await createReceivedRide.mutateAsync(values);
      reset({
        passengerId: values.passengerId,
        receivedDate: values.receivedDate,
        amount: 0,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Não foi possível registrar.",
      );
    }
  }

  async function handleDelete(receivedRide: ReceivedRide) {
    setDeletingId(receivedRide.id);

    try {
      await deleteReceivedRide.mutateAsync(receivedRide.id);
    } finally {
      setDeletingId(null);
    }
  }

  const sortedReceivedRides = [...(receivedRides ?? [])].sort((a, b) =>
    a.receivedDate < b.receivedDate ? 1 : -1,
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compensações</h1>
        <p className="text-sm opacity-70">
          Registre quando um passageiro te deu uma carona — o valor é abatido do que ele
          deve no mês.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="surface space-y-4 p-4">
        <div className="space-y-1">
          <Label htmlFor="passengerId">Passageiro</Label>
          <select
            id="passengerId"
            className="flex h-12 w-full rounded-[0.5rem] border border-input bg-[hsl(var(--form-background))] px-3 py-2 text-base text-[hsl(var(--form-foreground))] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("passengerId")}
          >
            <option value="">Selecione...</option>
            {passengers?.map((passenger) => (
              <option key={passenger.id} value={passenger.id}>
                {passenger.name}
              </option>
            ))}
          </select>
          {errors.passengerId && (
            <p className="text-xs text-destructive">{errors.passengerId.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="receivedDate">Data</Label>
          <Input
            id="receivedDate"
            type="date"
            max={todayISODate()}
            {...register("receivedDate")}
          />
          {errors.receivedDate && (
            <p className="text-xs text-destructive">{errors.receivedDate.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="amount">Valor a abater</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            {...register("amount")}
          />
          {errors.amount && (
            <p className="text-xs text-destructive">{errors.amount.message}</p>
          )}
        </div>

        {submitError && <p className="text-xs text-destructive">{submitError}</p>}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Registrando..." : "Registrar carona recebida"}
        </Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold opacity-70">
          Registradas em {formatMonthLabel(referenceMonth)}
        </h2>

        {isLoading && <p className="text-sm opacity-70">Carregando...</p>}

        {isError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar as compensações do mês.
          </p>
        )}

        {!isLoading && !isError && sortedReceivedRides.length === 0 && (
          <p className="text-sm opacity-70">
            Nenhuma compensação registrada neste mês ainda.
          </p>
        )}

        {sortedReceivedRides.map((receivedRide) => (
          <div
            key={receivedRide.id}
            className="surface flex items-center justify-between p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {passengerNames[receivedRide.passengerId] ?? "Passageiro"}
              </p>
              <p className="text-xs opacity-70">
                {formatDateDisplay(receivedRide.receivedDate)} ·{" "}
                {formatCurrency(receivedRide.amount)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={deletingId === receivedRide.id}
              onClick={() => handleDelete(receivedRide)}
              aria-label="Remover compensação"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
