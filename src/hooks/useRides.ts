import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createRide,
  deleteRide,
  listRidesByMonth,
  listRidesByPeriod,
  type CreateRideInput,
} from "@/services/rides.service";
import { EARLIEST_MOVEMENT_DATE, mergeById } from "@/utils/cycles";

const ridesKey = ["rides"] as const;

// Diárias de uma faixa única (start até end, inclusivas) mais todo o histórico dos passageiros
// em extraPassengerIds (quem nunca fechou). start nulo = só os extras. A tela filtra por passageiro.
export function useRidesByPeriod(
  start: string | null,
  end: string,
  extraPassengerIds: string[],
  enabled = true,
) {
  return usePrivateQuery({
    enabled,
    queryKey: [...ridesKey, "period", start, end, extraPassengerIds.join(",")],
    queryFn: async (scope) => {
      const lists = await Promise.all([
        start === null ? Promise.resolve([]) : listRidesByPeriod(start, end, undefined, scope),
        ...extraPassengerIds.map((id) =>
          listRidesByPeriod(EARLIEST_MOVEMENT_DATE, end, id, scope),
        ),
      ]);
      return mergeById(...lists);
    },
  });
}

export function useRidesByMonth(referenceMonth: string, enabled = true) {
  return usePrivateQuery({
    enabled,
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
    invalidateAlso: [["monthlyCharges"]],
  });
}

export function useDeleteRide() {
  return usePrivateMutation({
    mutationFn: (id: string, scope) => deleteRide(id, scope),
    invalidate: ridesKey,
    invalidateAlso: [["monthlyCharges"]],
  });
}
