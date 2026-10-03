import type { ReceivedRide, Ride } from "@/types/entities";

import { addCents, toCents } from "@/utils/money";
// Result amounts are integer cents; inputs are decimal transport values.
export function totalsByPassenger(
  rides: ReadonlyArray<Pick<Ride, "passengerId" | "rateCharged">>,
  receivedRides: ReadonlyArray<Pick<ReceivedRide, "passengerId" | "amount">>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const ride of rides) {
    const current = totals.get(ride.passengerId) ?? 0;
    totals.set(ride.passengerId, addCents(current, toCents(ride.rateCharged)));
  }
  for (const received of receivedRides) {
    const current = totals.get(received.passengerId) ?? 0;
    totals.set(received.passengerId, addCents(current, -toCents(received.amount)));
  }
  return totals;
}
