import type { Database } from "@/types/database";
import type {
  MonthlyCharge,
  Passenger,
  PassengerInvite,
  ReceivedRide,
  Ride,
} from "@/types/entities";

type PassengerRow = Database["public"]["Tables"]["passengers"]["Row"];
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type ReceivedRideRow = Database["public"]["Tables"]["received_rides"]["Row"];
type MonthlyChargeRow = Database["public"]["Tables"]["monthly_charges"]["Row"];
type PassengerInviteRow = Database["public"]["Tables"]["passenger_invites"]["Row"];

export function toPassenger(row: PassengerRow): Passenger {
  return {
    id: row.id,
    name: row.name,
    defaultDailyRate: row.default_daily_rate,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRide(row: RideRow): Ride {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    rideDate: row.ride_date,
    rateCharged: row.rate_charged,
    createdAt: row.created_at,
  };
}

export function toReceivedRide(row: ReceivedRideRow): ReceivedRide {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    receivedDate: row.received_date,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

export function toPassengerInvite(row: PassengerInviteRow): PassengerInvite {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    used: row.used,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export function toMonthlyCharge(row: MonthlyChargeRow): MonthlyCharge {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    referenceMonth: row.reference_month,
    totalAmount: row.total_amount,
    paid: row.paid,
    paidAmount: row.paid_amount,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}
