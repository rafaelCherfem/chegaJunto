import type { Passenger } from "@/types/entities";

export function DailySummary({
  passengers,
  registeredIds,
  isToday,
}: {
  passengers: Passenger[];
  registeredIds: ReadonlySet<string>;
  isToday: boolean;
}) {
  const active = passengers.filter((passenger) => passenger.active);
  const registered = active.filter((passenger) => registeredIds.has(passenger.id)).length;
  return (
    <div className="context-summary" aria-label="Registros dos passageiros ativos">
      <p className="text-xl font-semibold tabular-nums">
        {registered} de {active.length}
      </p>
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">
          {registered === 1 ? "carona registrada" : "caronas registradas"}{" "}
          {isToday ? "hoje" : "nesta data"} · passageiros ativos
        </p>
        {active.length > 0 && (
          <div className="daily-progress" aria-hidden="true">
            <span style={{ width: `${(registered / active.length) * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
