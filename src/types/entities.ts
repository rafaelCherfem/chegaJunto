export interface Passenger {
  id: string;
  name: string;
  defaultDailyRate: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Ride {
  id: string;
  passengerId: string;
  rideDate: string;
  rateCharged: number;
  createdAt: string;
}

export interface ReceivedRide {
  id: string;
  passengerId: string;
  receivedDate: string;
  amount: number;
  createdAt: string;
}

export interface PassengerInvite {
  id: string;
  passengerId: string;
  used: boolean;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export interface FlaggedRide {
  flagId: string;
  rideId: string;
  passengerId: string;
  rideDate: string;
  rateCharged: number;
  createdAt: string;
}

export interface MonthlyCharge {
  revision: number;
  activePaymentId: string | null;
  id: string;
  passengerId: string;
  referenceMonth: string;
  /** Primeiro e último dia do ciclo, ambos inclusivos (referenceMonth é sempre igual a periodStart). */
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  paid: boolean;
  paidAmount: number;
  paidAt: string | null;
  createdAt: string;
}

export type CycleStatus = "CLOSED" | "SKIPPED" | "NO_MOVEMENT";

/** Uma linha do resumo de close_cycle e preview_cycle (um passageiro). */
export interface CycleSummaryRow {
  passengerId: string;
  status: CycleStatus;
  /** ALREADY_CLOSED_UNTIL quando SKIPPED. */
  reason: string | null;
  /** Só vem em close_cycle, e só quando CLOSED. */
  chargeId: string | null;
  /** Nulo em SKIPPED. */
  periodStart: string | null;
  /** Em SKIPPED, o fim do último ciclo do passageiro; nos demais, a data escolhida. */
  periodEnd: string | null;
  /** Só em CLOSED. */
  totalAmount: number | null;
}

export interface ChargePaymentEvent {
  id: string;
  monthlyChargeId: string;
  kind: "PAYMENT" | "CANCEL" | "REOPEN";
  revision: number;
  signedAmount: number;
  relatedPaymentId: string | null;
}
