import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createRide,
  deleteRide,
  listRidesByMonth,
  type CreateRideInput,
} from "@/services/rides.service";

const ridesKey = ["rides"] as const;

export function useRidesByMonth(referenceMonth: string) {
  return usePrivateQuery({
    queryKey: [...ridesKey, referenceMonth],
    queryFn: (scope) => listRidesByMonth(referenceMonth, undefined, scope),
  });
}

export function usePassengerRides(
  passengerId: string,
  referenceMonth: string,
  enabled: boolean,
) {
  return usePrivateQuery({
    queryKey: [...ridesKey, referenceMonth, passengerId],
    queryFn: (scope) => listRidesByMonth(referenceMonth, passengerId, scope),
    enabled,
  });
}

export function useCreateRide() {
  return usePrivateMutation({
    mutationFn: (input: CreateRideInput, scope) => createRide(input, scope),
    invalidate: ridesKey,
  });
}

export function useDeleteRide() {
  return usePrivateMutation({
    mutationFn: (id: string, scope) => deleteRide(id, scope),
    invalidate: ridesKey,
  });
}
