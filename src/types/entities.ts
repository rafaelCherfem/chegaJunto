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
  id: string;
  passengerId: string;
  referenceMonth: string;
  totalAmount: number;
  paid: boolean;
  paidAmount: number;
  paidAt: string | null;
  createdAt: string;
}
