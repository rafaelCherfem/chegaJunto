import { useMemo, useState } from "react";
import { PassengerRideButton } from "@/components/rides/PassengerRideButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePassengers } from "@/hooks/usePassengers";
import { useCreateRide, useDeleteRide, useRidesByMonth } from "@/hooks/useRides";
import {
  assertRecordDate,
  currentMonthStart,
  isCalendarDate,
  FUTURE_DATE_ERROR,
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

  const { data: passengers, isLoading: loadingPassengers } = usePassengers();
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
    } catch (error) {
      setRideError(
        error instanceof Error ? error.message : "Não foi possível registrar.",
      );
    } finally {
      setRegisteringId(null);
    }
  }

  async function handleDelete(ride: Ride) {
    setDeletingId(ride.id);

    try {
      await deleteRide.mutateAsync(ride.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Diárias</h1>
        <p className="text-sm opacity-70">
          Toque no passageiro para registrar. Use a seta para ver o histórico do mês.
        </p>
      </div>

      <div className="max-w-[200px] space-y-1">
        <Label htmlFor="rideDate">Data</Label>
        <Input
          id="rideDate"
          type="date"
          max={today}
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
        />
      </div>

      {(dateError || rideError) && (
        <p role="alert" className="text-sm text-destructive">
          {dateError || rideError}
        </p>
      )}

      {loadingPassengers && (
        <p className="text-sm opacity-70">Carregando passageiros...</p>
      )}

      {!loadingPassengers && passengers?.length === 0 && (
        <p className="text-sm opacity-70">
          Cadastre um passageiro antes de registrar diárias.
        </p>
      )}

      {ridesError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar o histórico do mês.
        </p>
      )}

      <div className="space-y-2">
        {passengers?.map((passenger) => (
          <PassengerRideButton
            key={passenger.id}
            passenger={passenger}
            registered={ridesOnSelectedDate.has(passenger.id)}
            registering={registeringId === passenger.id}
            monthRides={ridesByPassenger.get(passenger.id) ?? []}
            deletingId={deletingId}
            onRegister={handleRegister}
            onDeleteRide={handleDelete}
          />
        ))}
      </div>

      {loadingRides && <p className="text-sm opacity-70">Carregando...</p>}
    </div>
  );
}
