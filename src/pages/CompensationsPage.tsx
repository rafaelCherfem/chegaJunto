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
    <div className="page--compensations mx-auto space-y-5 p-6">
      <div>
        <h1 className="page-heading">Compensações</h1>
        <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
          Registre quando um passageiro te deu uma carona — o valor é abatido do que ele
          deve no mês.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="form-panel">
        <div className="space-y-1">
          <Label htmlFor="passengerId">Passageiro</Label>
          <select
            id="passengerId"
            aria-invalid={Boolean(errors.passengerId)}
            aria-describedby={
              errors.passengerId ? "compensation-passenger-error" : undefined
            }
            className="form-select"
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
            <p
              id="compensation-passenger-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.passengerId.message}
            </p>
          )}
        </div>

        <div className="field-row">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="receivedDate">Data</Label>
            <Input
              id="receivedDate"
              aria-invalid={Boolean(errors.receivedDate)}
              aria-describedby={
                errors.receivedDate ? "compensation-date-error" : undefined
              }
              type="date"
              max={todayISODate()}
              {...register("receivedDate")}
            />
            {errors.receivedDate && (
              <p
                id="compensation-date-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.receivedDate.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <Label htmlFor="amount">Valor a abater</Label>
            <Input
              id="amount"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "compensation-amount-error" : undefined}
              type="number"
              step="0.01"
              inputMode="decimal"
              {...register("amount")}
            />
            {errors.amount && (
              <p
                id="compensation-amount-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.amount.message}
              </p>
            )}
          </div>
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
          className="w-full whitespace-normal sm:w-auto"
        >
          {isSubmitting ? "Registrando..." : "Registrar carona recebida"}
        </Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold opacity-70">
          Registradas em {formatMonthLabel(referenceMonth)}
        </h2>

        {isLoading && (
          <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            Carregando...
          </p>
        )}

        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as compensações do mês.
          </p>
        )}

        {!isLoading && !isError && sortedReceivedRides.length === 0 && (
          <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            Nenhuma compensação registrada neste mês ainda.
          </p>
        )}

        {sortedReceivedRides.map((receivedRide) => (
          <div
            key={receivedRide.id}
            className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 py-3"
          >
            <div className="min-w-0">
              <p className="break-words [overflow-wrap:anywhere] text-sm font-semibold">
                {passengerNames[receivedRide.passengerId] ?? "Passageiro"}
              </p>
              <p className="text-sm tabular-nums text-muted-foreground">
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
              title="Remover compensação"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
