import { Flag, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { addCents, toCents } from "@/utils/money";
import { CarIllustration } from "@/components/illustrations/CarIllustration";
import { Button } from "@/components/ui/button";
import { usePassenger } from "@/hooks/usePassengers";
import { useReceivedRidesByMonth } from "@/hooks/useReceivedRides";
import { useFlagRide } from "@/hooks/useRideFlags";
import { usePassengerRides } from "@/hooks/useRides";
import { signOut } from "@/services/auth.service";
import { formatCurrency } from "@/utils/currency";
import { currentMonthStart, formatDateDisplay, formatMonthLabel } from "@/utils/date";
import type { Ride } from "@/types/entities";

interface PassengerPortalPageProps {
  passengerId: string;
}

export function PassengerPortalPage({ passengerId }: PassengerPortalPageProps) {
  const referenceMonth = currentMonthStart();

  const { data: passenger, isLoading: loadingPassenger } = usePassenger(passengerId);
  const { data: rides, isLoading: loadingRides } = usePassengerRides(
    passengerId,
    referenceMonth,
    true,
  );
  const { data: receivedRides, isLoading: loadingReceived } =
    useReceivedRidesByMonth(referenceMonth);

  const flagRide = useFlagRide();
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [flagError, setFlagError] = useState<string | null>(null);

  const rideTotal = useMemo(
    () => (rides ?? []).reduce((sum, ride) => addCents(sum, toCents(ride.rateCharged)), 0),
    [rides],
  );

  const compensationTotal = useMemo(
    () =>
      (receivedRides ?? [])
        .filter((received) => received.passengerId === passengerId)
        .reduce((sum, received) => addCents(sum, toCents(received.amount)), 0),
    [receivedRides, passengerId],
  );

  const previewTotal = addCents(rideTotal, -compensationTotal);

  const sortedRides = useMemo(
    () => [...(rides ?? [])].sort((a, b) => (a.rideDate < b.rideDate ? 1 : -1)),
    [rides],
  );

  async function handleFlag(ride: Ride) {
    setFlagError(null);
    setFlaggingId(ride.id);

    try {
      await flagRide.mutateAsync(ride.id);
      setFlaggedIds((current) => new Set(current).add(ride.id));
    } catch (error) {
      setFlagError(
        error instanceof Error ? error.message : "Não foi possível sinalizar.",
      );
    } finally {
      setFlaggingId(null);
    }
  }

  const loading = loadingPassenger || loadingRides || loadingReceived;

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between px-6 pt-5 pb-4">
        <span className="text-lg font-semibold tracking-tight">RideLedger</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut()}
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="mx-auto max-w-lg space-y-6 p-6">
        <CarIllustration />

        {loading && <p className="text-sm opacity-70">Carregando...</p>}

        {!loading && (
          <>
            <div className="surface p-6 text-center">
              <p className="text-sm opacity-70">
                Prévia de {formatMonthLabel(referenceMonth)}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {formatCurrency(previewTotal / 100)}
              </p>
              {compensationTotal > 0 && (
                <p className="mt-1 text-xs opacity-70">
                  Diárias: {formatCurrency(rideTotal / 100)} · Compensação: −
                  {formatCurrency(compensationTotal / 100)}
                </p>
              )}
              <p className="mt-2 text-xs opacity-60">
                Olá, {passenger?.name} — este valor pode mudar até o
                fechamento do mês.
              </p>
            </div>

            {flagError && (
              <p className="text-sm text-destructive">{flagError}</p>
            )}

            <div className="space-y-2">
              <h2 className="text-sm font-semibold opacity-70">
                Suas diárias neste mês
              </h2>

              {sortedRides.length === 0 && (
                <p className="text-sm opacity-70">
                  Nenhuma diária registrada neste mês ainda.
                </p>
              )}

              {sortedRides.map((ride) => {
                const alreadyFlagged = flaggedIds.has(ride.id);
                return (
                  <div
                    key={ride.id}
                    className="surface flex items-center justify-between p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {formatDateDisplay(ride.rideDate)}
                      </p>
                      <p className="text-xs opacity-70">
                        {formatCurrency(ride.rateCharged)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={flaggingId === ride.id || alreadyFlagged}
                      onClick={() => handleFlag(ride)}
                    >
                      <Flag className="mr-2 h-3.5 w-3.5" />
                      {alreadyFlagged
                        ? "Sinalizada"
                        : flaggingId === ride.id
                          ? "Enviando..."
                          : "Sinalizar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
