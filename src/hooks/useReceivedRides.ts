import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createReceivedRide,
  deleteReceivedRide,
  listReceivedRidesByMonth,
  type CreateReceivedRideInput,
} from "@/services/receivedRides.service";

const receivedRidesKey = ["receivedRides"] as const;

export function useReceivedRidesByMonth(referenceMonth: string, enabled = true) {
  return usePrivateQuery({
    enabled,
    queryKey: [...receivedRidesKey, referenceMonth],
    queryFn: (scope) => listReceivedRidesByMonth(referenceMonth, undefined, scope),
  });
}

export function useCreateReceivedRide() {
  return usePrivateMutation({
    mutationFn: (input: CreateReceivedRideInput, scope) =>
      createReceivedRide(input, scope),
    invalidate: receivedRidesKey,
    invalidateAlso: [["monthlyCharges"]],
  });
}

export function useDeleteReceivedRide() {
  return usePrivateMutation({
    mutationFn: (id: string, scope) => deleteReceivedRide(id, scope),
    invalidate: receivedRidesKey,
    invalidateAlso: [["monthlyCharges"]],
  });
}
