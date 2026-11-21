import { nextDay } from "@/utils/date";
import { addCents, toCents } from "@/utils/money";
import type { MonthlyCharge, ReceivedRide, Ride } from "@/types/entities";

/** Chave do ciclo em aberto na lista de ciclos (os fechados usam o period_end). */
export const OPEN_CYCLE_KEY = "open";
/** Para quem nunca fechou, todo o movimento conta; esta é a data mais antiga que pedimos. */
export const EARLIEST_MOVEMENT_DATE = "1900-01-01";

/** Cobranças que terminam no mesmo dia: uma chamada de fechamento. */
export interface CycleGroup {
  periodEnd: string;
  /** O menor início entre as cobranças do grupo (quem começou depois mostra "desde dd/mm"). */
  periodStart: string;
  charges: MonthlyCharge[];
}

// As datas são AAAA-MM-DD, então a ordem do texto é a ordem do calendário.
export function groupChargesByPeriodEnd(charges: ReadonlyArray<MonthlyCharge>): CycleGroup[] {
  const byEnd = new Map<string, MonthlyCharge[]>();
  for (const charge of charges) {
    byEnd.set(charge.periodEnd, [...(byEnd.get(charge.periodEnd) ?? []), charge]);
  }
  return Array.from(byEnd, ([periodEnd, group]) => ({
    periodEnd,
    periodStart: group.reduce(
      (earliest, charge) => (charge.periodStart < earliest ? charge.periodStart : earliest),
      group[0]!.periodStart,
    ),
    charges: group,
  })).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0));
}

/** Fim do último ciclo de cada passageiro que já fechou. */
export function lastClosedEnds(charges: ReadonlyArray<MonthlyCharge>): Map<string, string> {
  const ends = new Map<string, string>();
  for (const charge of charges) {
    const current = ends.get(charge.passengerId);
    if (current === undefined || charge.periodEnd > current) {
      ends.set(charge.passengerId, charge.periodEnd);
    }
  }
  return ends;
}

/** O menor início em aberto entre quem já fechou (fim do último ciclo + 1), ou null se ninguém fechou. */
export function openCycleLookback(charges: ReadonlyArray<MonthlyCharge>): string | null {
  let lookback: string | null = null;
  for (const end of lastClosedEnds(charges).values()) {
    const start = nextDay(end);
    if (lookback === null || start < lookback) lookback = start;
  }
  return lookback;
}

/** Passageiros que ainda não têm nenhuma cobrança: o ciclo deles começa na primeira diária. */
export function neverClosedPassengerIds(
  passengerIds: ReadonlyArray<string>,
  charges: ReadonlyArray<MonthlyCharge>,
): string[] {
  const closed = new Set(charges.map((charge) => charge.passengerId));
  return passengerIds.filter((id) => !closed.has(id));
}

export interface PeriodTotals {
  rideCents: number;
  compensationCents: number;
  /** Diárias menos compensações, em centavos. */
  totalCents: number;
  /** Quantas diárias e compensações caíram no período. */
  count: number;
}

/** Diárias menos compensações de um passageiro entre duas datas, ambas inclusivas. */
export function periodTotals(
  rides: ReadonlyArray<Ride>,
  receivedRides: ReadonlyArray<ReceivedRide>,
  passengerId: string,
  start: string,
  end: string,
): PeriodTotals {
  let rideCents = 0;
  let compensationCents = 0;
  let count = 0;
  for (const ride of rides) {
    if (ride.passengerId !== passengerId || ride.rideDate < start || ride.rideDate > end) continue;
    rideCents = addCents(rideCents, toCents(ride.rateCharged));
    count += 1;
  }
  for (const received of receivedRides) {
    if (
      received.passengerId !== passengerId ||
      received.receivedDate < start ||
      received.receivedDate > end
    )
      continue;
    compensationCents = addCents(compensationCents, toCents(received.amount));
    count += 1;
  }
  return { rideCents, compensationCents, totalCents: addCents(rideCents, -compensationCents), count };
}

export interface OpenCycleRow {
  passengerId: string;
  /** Início deste passageiro no ciclo em aberto. */
  start: string;
  totals: PeriodTotals;
}

export interface OpenCycle {
  /** O menor início entre os passageiros com movimento em aberto; null quando ninguém tem. */
  periodStart: string | null;
  rows: OpenCycleRow[];
}

/**
 * Ciclo em aberto: o que veio depois do último fechamento de cada passageiro.
 * Início de quem já fechou = fim do último ciclo + 1; de quem nunca fechou = a primeira
 * diária ou compensação dele. Só entra quem tem movimento entre o início e hoje.
 */
export function buildOpenCycle(
  charges: ReadonlyArray<MonthlyCharge>,
  rides: ReadonlyArray<Ride>,
  receivedRides: ReadonlyArray<ReceivedRide>,
  today: string,
): OpenCycle {
  const ends = lastClosedEnds(charges);
  const firstMovement = new Map<string, string>();
  const note = (passengerId: string, date: string) => {
    const current = firstMovement.get(passengerId);
    if (current === undefined || date < current) firstMovement.set(passengerId, date);
  };
  for (const ride of rides) note(ride.passengerId, ride.rideDate);
  for (const received of receivedRides) note(received.passengerId, received.receivedDate);

  const rows: OpenCycleRow[] = [];
  for (const [passengerId, first] of firstMovement) {
    const lastEnd = ends.get(passengerId);
    const start = lastEnd === undefined ? first : nextDay(lastEnd);
    const totals = periodTotals(rides, receivedRides, passengerId, start, today);
    if (totals.count > 0) rows.push({ passengerId, start, totals });
  }
  rows.sort((a, b) => (a.passengerId < b.passengerId ? -1 : 1));
  return {
    periodStart: rows.reduce<string | null>(
      (earliest, row) => (earliest === null || row.start < earliest ? row.start : earliest),
      null,
    ),
    rows,
  };
}

/** Junta listas sem repetir o mesmo registro (a consulta geral e a do passageiro novo se sobrepõem). */
export function mergeById<T extends { id: string }>(...lists: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Map<string, T>();
  for (const list of lists) for (const item of list) if (!seen.has(item.id)) seen.set(item.id, item);
  return Array.from(seen.values());
}
