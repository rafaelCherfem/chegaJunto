import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePassengers } from "@/hooks/usePassengers";
import { useResolveFlag, useUnresolvedFlags } from "@/hooks/useRideFlags";
import { useDeleteRide } from "@/hooks/useRides";
import { formatCurrency } from "@/utils/currency";
import { formatDateDisplay } from "@/utils/date";

export function FlaggedRidesPage() {
  const { data: flags, isLoading, isError } = useUnresolvedFlags();
  const { data: passengers } = usePassengers(true);
  const resolveFlag = useResolveFlag();
  const deleteRide = useDeleteRide();

  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const passengerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const passenger of passengers ?? []) {
      map[passenger.id] = passenger.name;
    }
    return map;
  }, [passengers]);

  async function handleDismiss(flagId: string) {
    setActionError(null);
    setActingId(flagId);

    try {
      await resolveFlag.mutateAsync(flagId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Não foi possível atualizar.",
      );
    } finally {
      setActingId(null);
    }
  }

  async function handleDeleteRide(flagId: string, rideId: string) {
    setActionError(null);
    setActingId(flagId);

    try {
      await deleteRide.mutateAsync(rideId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Não foi possível excluir a diária.",
      );
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-6">
      <div>
        <h1 className="page-heading">Sinalizadas</h1>
        <p className="text-sm text-muted-foreground">
          Diárias que um passageiro marcou como cobradas errado.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando...
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as sinalizações.
        </p>
      )}

      {!isLoading && !isError && flags?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma diária sinalizada.</p>
      )}

      <div className="space-y-2">
        {flags?.map((flag) => (
          <div key={flag.flagId} className="surface p-4">
            <p className="break-words font-semibold [overflow-wrap:anywhere]">
              {passengerNames[flag.passengerId] ?? "Passageiro"}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDateDisplay(flag.rideDate)} · {formatCurrency(flag.rateCharged)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={actingId === flag.flagId}
                onClick={() => handleDeleteRide(flag.flagId, flag.rideId)}
              >
                Excluir diária
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={actingId === flag.flagId}
                onClick={() => handleDismiss(flag.flagId)}
              >
                Descartar sinalização
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
