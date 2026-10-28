import { DailySummary } from "@/components/rides/DailySummary";
import { useMemo, useState } from "react";
import { PassengerRideButton } from "@/components/rides/PassengerRideButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePassengers } from "@/hooks/usePassengers";
import { cn } from "@/lib/utils";
import { useCreateRide, useDeleteRide, useRidesByMonth } from "@/hooks/useRides";
import {
  assertRecordDate,
  currentMonthStart,
  isCalendarDate,
  FUTURE_DATE_ERROR,
  formatDateDisplay,
  formatMonthLabel,
  referenceMonthFromDate,
  todayISODate,
} from "@/utils/date";
import type { Passenger, Ride } from "@/types/entities";

export function RidesPage() {
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const validDate = isCalendarDate(selectedDate);
  const today = todayISODate();
  const dateError = !validDate
    ? "Informe uma data válida."
    : selectedDate > today
      ? FUTURE_DATE_ERROR
      : null;
  const referenceMonth = validDate
    ? referenceMonthFromDate(selectedDate)
    : currentMonthStart();

  const {
    data: passengers,
    isLoading: loadingPassengers,
    isError: passengersError,
  } = usePassengers();
  const {
    data: rides,
    isLoading: loadingRides,
    isError: ridesError,
  } = useRidesByMonth(referenceMonth, !dateError);

  const createRide = useCreateRide();
  const deleteRide = useDeleteRide();

  const [rideError, setRideError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Só a linha que acabou de ser registrada anima; abrir a tela ou trocar de
  // data mostra os registros já feitos sem movimento.
  const [justRegistered, setJustRegistered] = useState<{
    passengerId: string;
    rideDate: string;
  } | null>(null);

  const ridesOnSelectedDate = useMemo(
    () =>
      new Set(
        (rides ?? [])
          .filter((ride) => ride.rideDate === selectedDate)
          .map((ride) => ride.passengerId),
      ),
    [rides, selectedDate],
  );

  const ridesByPassenger = useMemo(() => {
    const map = new Map<string, Ride[]>();
    for (const ride of rides ?? []) {
      const list = map.get(ride.passengerId) ?? [];
      list.push(ride);
      map.set(ride.passengerId, list);
    }
    return map;
  }, [rides]);

  async function handleRegister(passenger: Passenger) {
    setRideError(null);
    setRegisteringId(passenger.id);

    try {
      assertRecordDate(selectedDate);
      await createRide.mutateAsync({
        passengerId: passenger.id,
        rideDate: selectedDate,
      });
      setJustRegistered({ passengerId: passenger.id, rideDate: selectedDate });
    } catch (error) {
      setRideError(
        error instanceof Error ? error.message : "Não foi possível registrar.",
      );
    } finally {
      setRegisteringId(null);
    }
  }

  async function handleDelete(ride: Ride) {
    setRideError(null);
    setDeletingId(ride.id);

    try {
      await deleteRide.mutateAsync(ride.id);
    } catch (error) {
      setRideError(
        error instanceof Error ? error.message : "Não foi possível remover a diária.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page--rides mx-auto space-y-5 p-6">
      <header className="space-y-4">
        <h1 className="page-heading">Diárias</h1>
        <div
          className={cn(
            "ride-date-context",
            validDate && selectedDate !== today && "ride-date-context--stacked",
          )}
        >
          <div className="min-w-0 space-y-1">
            <p className="stat-label first-letter:uppercase">
              {formatMonthLabel(referenceMonth)}
            </p>
            {validDate ? (
              <time
                dateTime={selectedDate}
                className="stat-value block text-[clamp(2rem,11vw,2.5rem)] leading-[1.05]"
              >
                {selectedDate === today ? "Hoje" : formatDateDisplay(selectedDate)}
              </time>
            ) : (
              <p className="text-base font-medium">Selecione uma data</p>
            )}
            {validDate && selectedDate === today && (
              <p className="text-sm text-muted-foreground">
                {formatDateDisplay(selectedDate)}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="rideDate">Data</Label>
            <Input
              id="rideDate"
              type="date"
              max={today}
              value={selectedDate}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "ride-error" : undefined}
              onChange={(event) => {
                setJustRegistered(null);
                setSelectedDate(event.target.value);
              }}
            />
          </div>
        </div>
      </header>

      {!dateError &&
        !loadingPassengers &&
        !loadingRides &&
        !passengersError &&
        !ridesError &&
        passengers &&
        rides && (
          <DailySummary
            passengers={passengers}
            registeredIds={ridesOnSelectedDate}
            isToday={selectedDate === today}
          />
        )}

      {(dateError || rideError) && (
        <p id="ride-error" role="alert" className="ride-feedback ride-feedback--error">
          {dateError || rideError}
        </p>
      )}

      {loadingPassengers && (
        <p role="status" className="ride-feedback">
          Carregando passageiros...
        </p>
      )}

      {passengersError && (
        <p role="alert" className="ride-feedback ride-feedback--error">
          Não foi possível carregar os passageiros. Tente novamente.
        </p>
      )}

      {!loadingPassengers && !passengersError && passengers?.length === 0 && (
        <p className="ride-feedback">
          Cadastre um passageiro antes de registrar diárias.
        </p>
      )}

      {ridesError && (
        <p role="alert" className="ride-feedback ride-feedback--error">
          Não foi possível carregar o histórico do mês.
        </p>
      )}

      {Boolean(passengers?.length) && (
        <section
          aria-labelledby="ride-passengers-heading"
          className="ride-passengers space-y-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="ride-passengers-heading" className="text-base font-semibold">
              Passageiros
            </h2>
            <p className="text-sm text-muted-foreground">
              Histórico de {formatMonthLabel(referenceMonth)}
            </p>
          </div>
          <ul className="ride-list" aria-label="Passageiros e registros">
            {passengers?.map((passenger) => (
              <li key={passenger.id}>
                <PassengerRideButton
                  passenger={passenger}
                  registered={ridesOnSelectedDate.has(passenger.id)}
                  registering={registeringId === passenger.id}
                  justRegistered={
                    justRegistered?.passengerId === passenger.id &&
                    justRegistered.rideDate === selectedDate
                  }
                  onRegisteredAnimationEnd={() => setJustRegistered(null)}
                  monthRides={ridesByPassenger.get(passenger.id) ?? []}
                  deletingId={deletingId}
                  onRegister={handleRegister}
                  onDeleteRide={handleDelete}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {loadingRides && (
        <p role="status" className="ride-feedback">
          Carregando registros do mês...
        </p>
      )}
    </div>
  );
}
