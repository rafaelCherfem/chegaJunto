import { Check, ChevronDown, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/currency";
import { formatDateDisplay } from "@/utils/date";
import { initials } from "@/utils/initials";
import type { Passenger, Ride } from "@/types/entities";

interface PassengerRideButtonProps {
  passenger: Passenger;
  registered: boolean;
  registering: boolean;
  justRegistered?: boolean;
  monthRides: Ride[];
  deletingId: string | null;
  onRegister: (passenger: Passenger) => void;
  onRegisteredAnimationEnd?: () => void;
  onDeleteRide: (ride: Ride) => void;
}

export function PassengerRideButton({
  passenger,
  registered,
  registering,
  justRegistered = false,
  monthRides,
  deletingId,
  onRegister,
  onRegisteredAnimationEnd,
  onDeleteRide,
}: PassengerRideButtonProps) {
  const celebrating = registered && justRegistered;
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();

  const sortedRides = [...monthRides].sort((a, b) => (a.rideDate < b.rideDate ? 1 : -1));

  return (
    <div className="py-0.5">
      <div className="space-y-1">
        <button
          type="button"
          disabled={registered || registering}
          onClick={() => onRegister(passenger)}
          onAnimationEnd={celebrating ? onRegisteredAnimationEnd : undefined}
          aria-label={`${passenger.name} ${registered ? "Registrado" : registering ? "Registrando..." : "Registrar"}`}
          aria-busy={registering}
          aria-describedby={`${historyId}-rate`}
          data-state={registered ? "registered" : registering ? "registering" : "idle"}
          className="ride-register-row focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span
            aria-hidden="true"
            className={
              registered
                ? celebrating
                  ? "avatar avatar--done avatar--pop"
                  : "avatar avatar--done"
                : "avatar"
            }
          >
            {initials(passenger.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[0.9375rem] font-semibold leading-5 [overflow-wrap:anywhere]">
              {passenger.name}
            </span>
            <span
              id={`${historyId}-rate`}
              className="mt-0.5 block text-xs text-muted-foreground"
            >
              <span className="sr-only">Diária </span>
              <span className="tabular-nums [overflow-wrap:anywhere]">
                {formatCurrency(passenger.defaultDailyRate)}
              </span>
              <span>{registered ? " · registrado" : " padrão"}</span>
            </span>
          </span>
          <span
            className={
              registered ? "ride-register-action ride-register-action--done" : "ride-register-action"
            }
          >
            {registered && (
              <Check
                aria-hidden="true"
                className={`h-5 w-5 ${celebrating ? "ride-check-in motion-reduce:animate-none" : ""}`}
              />
            )}
            {registering && !registered && (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            )}
            {!registered && !registering && (
              <Plus aria-hidden="true" className="h-4 w-4" />
            )}
            <span className={registered ? "sr-only" : undefined}>
              {registered ? "Registrado" : registering ? "Registrando..." : "Registrar"}
            </span>
          </span>
        </button>

        <div aria-live="polite" className="sr-only">
          {registered
            ? `${passenger.name}: diária registrada.`
            : registering
              ? `${passenger.name}: registrando diária.`
              : ""}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-label={expanded ? "Esconder histórico do mês" : "Ver histórico do mês"}
          aria-expanded={expanded}
          aria-controls={historyId}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[0.5rem] px-3 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Histórico do mês
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div id={historyId} hidden={!expanded} className="ride-history ml-6">
        {sortedRides.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nenhuma diária registrada neste mês.
          </p>
        ) : (
          <ul
            className="divide-y divide-border/50"
            aria-label={`Histórico de ${passenger.name}`}
          >
            {sortedRides.map((ride) => (
              <li key={ride.id} className="ride-history-row">
                <time dateTime={ride.rideDate} className="tabular-nums">
                  {formatDateDisplay(ride.rideDate)}
                </time>
                <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
                  <span className="min-w-0 text-right font-medium tabular-nums [overflow-wrap:anywhere]">
                    {formatCurrency(ride.rateCharged)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === ride.id}
                    onClick={() => onDeleteRide(ride)}
                    aria-label="Remover diária"
                    title="Remover diária"
                    aria-busy={deletingId === ride.id}
                    className="h-11 w-11 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
