import type { ReceivedRide, Ride } from "@/types/entities";

// Characterization extraction: retains decimal number arithmetic and insertion
// order. Integer cents and existing-charge reconciliation belong to hardening.
export function totalsByPassenger(
  rides: ReadonlyArray<Pick<Ride, "passengerId" | "rateCharged">>,
  receivedRides: ReadonlyArray<Pick<ReceivedRide, "passengerId" | "amount">>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const ride of rides) {
    const current = totals.get(ride.passengerId) ?? 0;
    totals.set(ride.passengerId, current + ride.rateCharged);
  }
  for (const received of receivedRides) {
    const current = totals.get(received.passengerId) ?? 0;
    totals.set(received.passengerId, current - received.amount);
  }
  return totals;
}
