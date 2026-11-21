import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createReceivedRide,
  deleteReceivedRide,
  listReceivedRidesByMonth,
  listReceivedRidesByPeriod,
  type CreateReceivedRideInput,
} from "@/services/receivedRides.service";
import { EARLIEST_MOVEMENT_DATE, mergeById } from "@/utils/cycles";

const receivedRidesKey = ["receivedRides"] as const;

// Mesma ideia de useRidesByPeriod, para as compensações.
export function useReceivedRidesByPeriod(
  start: string | null,
  end: string,
  extraPassengerIds: string[],
  enabled = true,
) {
  return usePrivateQuery({
    enabled,
    queryKey: [...receivedRidesKey, "period", start, end, extraPassengerIds.join(",")],
    queryFn: async (scope) => {
      const lists = await Promise.all([
        start === null ? Promise.resolve([]) : listReceivedRidesByPeriod(start, end, undefined, scope),
        ...extraPassengerIds.map((id) =>
          listReceivedRidesByPeriod(EARLIEST_MOVEMENT_DATE, end, id, scope),
        ),
      ]);
      return mergeById(...lists);
    },
  });
}

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
