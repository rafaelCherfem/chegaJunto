import { Check } from "lucide-react";
import { CompleteMark } from "@/components/ui/complete-mark";
import type { Passenger } from "@/types/entities";

const RADIUS = 29;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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
  const remaining = active.length - registered;
  const complete = active.length > 0 && remaining === 0;
  const filled = active.length > 0 ? (registered / active.length) * CIRCUMFERENCE : 0;
  const when = isToday ? "hoje" : "nesta data";

  return (
    <div className="day-card" aria-label="Registros dos passageiros ativos">
      {active.length > 0 && (
        <div className={complete ? "day-ring day-ring--complete" : "day-ring"}>
          <svg viewBox="0 0 68 68" aria-hidden="true">
            <circle className="day-ring__track" cx="34" cy="34" r={RADIUS} />
            <circle
              className="day-ring__value"
              cx="34"
              cy="34"
              r={RADIUS}
              strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            />
          </svg>
          <span className="day-ring__label" aria-hidden="true">
            {complete ? (
              <Check className="day-ring__check h-7 w-7" strokeWidth={3} />
            ) : (
              <>
                {registered}
                <span className="font-medium text-muted-foreground">/{active.length}</span>
              </>
            )}
          </span>
        </div>
      )}

      <div className="min-w-0 space-y-1">
        <p className="stat-value text-xl">
          {registered} de {active.length}
        </p>
        {complete ? (
          <CompleteMark>Tudo registrado {when}</CompleteMark>
        ) : (
          <p className="text-sm leading-snug text-muted-foreground">
            {registered === 1 ? "carona registrada" : "caronas registradas"} {when}
            {remaining > 0 && (
              <>
                {" · falta"}
                {remaining > 1 ? `m ${remaining} passageiros` : " 1 passageiro"}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
