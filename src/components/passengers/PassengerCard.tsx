import { Calendar, KeyRound, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { PassengerInvitePanel } from "@/components/passengers/PassengerInvitePanel";
import { Button } from "@/components/ui/button";
import { usePassengerRides } from "@/hooks/useRides";
import { formatCurrency } from "@/utils/currency";
import { currentMonthStart, formatDateDisplay, formatMonthLabel } from "@/utils/date";
import type { Passenger } from "@/types/entities";

interface PassengerCardProps {
  passenger: Passenger;
  deleting: boolean;
  deleteError: string | null;
  onEdit: (passenger: Passenger) => void;
  onToggleActive: (passenger: Passenger) => void;
  onDelete: (passenger: Passenger) => void;
}

export function PassengerCard({
  passenger,
  deleting,
  deleteError,
  onEdit,
  onToggleActive,
  onDelete,
}: PassengerCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const referenceMonth = currentMonthStart();
  const { data: rides, isLoading } = usePassengerRides(
    passenger.id,
    referenceMonth,
    historyOpen,
  );

  const sortedRides = rides
    ? [...rides].sort((a, b) => (a.rideDate < b.rideDate ? 1 : -1))
    : [];

  return (
    <div className="surface p-4">
      <div className="passenger-row">
        <div className="min-w-0 flex-1 basis-48">
          <p className="break-words [overflow-wrap:anywhere] text-base font-semibold leading-6">
            {passenger.name}
          </p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatCurrency(passenger.defaultDailyRate)} por diária
            {!passenger.active && " · Inativo"}
          </p>
        </div>

        <div className="passenger-actions">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-label="Ver histórico do mês"
            title="Histórico do mês"
            aria-expanded={historyOpen}
          >
            <Calendar className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setInviteOpen((open) => !open)}
            aria-label="Acesso do passageiro"
            title="Acesso do passageiro"
            aria-expanded={inviteOpen}
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(passenger)}
            aria-label="Editar passageiro"
            title="Editar passageiro"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleActive(passenger)}
            title={passenger.active ? "Desativar passageiro" : "Reativar passageiro"}
            aria-label={passenger.active ? "Desativar passageiro" : "Reativar passageiro"}
          >
            {passenger.active ? (
              <PowerOff className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmingDelete((open) => !open)}
            aria-label="Excluir passageiro"
            title="Excluir passageiro"
            aria-expanded={confirmingDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {historyOpen && (
        <div className="mt-3 border-t border-black/10 pt-3">
          <p className="mb-2 text-xs font-medium capitalize opacity-70">
            Diárias de {formatMonthLabel(referenceMonth)}
          </p>

          {isLoading && <p className="text-xs opacity-70">Carregando...</p>}

          {!isLoading && sortedRides.length === 0 && (
            <p className="text-xs opacity-70">Nenhuma diária registrada neste mês.</p>
          )}

          {!isLoading && sortedRides.length > 0 && (
            <ul className="space-y-1">
              {sortedRides.map((ride) => (
                <li key={ride.id} className="flex justify-between text-xs">
                  <span>{formatDateDisplay(ride.rideDate)}</span>
                  <span className="opacity-70">{formatCurrency(ride.rateCharged)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {inviteOpen && <PassengerInvitePanel passengerId={passenger.id} />}

      {confirmingDelete && (
        <div className="mt-3 space-y-2 border-t border-black/10 pt-3">
          <p className="text-xs">
            Excluir <strong className="[overflow-wrap:anywhere]">{passenger.name}</strong>{" "}
            definitivamente? Só é possível se ele nunca teve diária, cobrança ou
            compensação registrada.
          </p>

          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => onDelete(passenger)}
            >
              {deleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
