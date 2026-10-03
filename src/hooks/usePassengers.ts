import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createPassenger,
  deletePassenger,
  getPassenger,
  listPassengers,
  setPassengerActive,
  updatePassenger,
  type CreatePassengerInput,
  type UpdatePassengerInput,
} from "@/services/passengers.service";

const passengersKey = ["passengers"] as const;

export function usePassengers(includeInactive = false) {
  return usePrivateQuery({
    queryKey: [...passengersKey, { includeInactive }],
    queryFn: (scope) => listPassengers(includeInactive, scope),
  });
}

export function usePassenger(id: string) {
  return usePrivateQuery({
    queryKey: [...passengersKey, id],
    queryFn: (scope) => getPassenger(id, scope),
    enabled: Boolean(id),
  });
}

export function useCreatePassenger() {
  return usePrivateMutation({
    mutationFn: (input: CreatePassengerInput, scope) => createPassenger(input, scope),
    invalidate: passengersKey,
  });
}

export function useUpdatePassenger() {
  return usePrivateMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePassengerInput }, scope) =>
      updatePassenger(id, input, scope),
    invalidate: passengersKey,
  });
}

export function useSetPassengerActive() {
  return usePrivateMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }, scope) =>
      setPassengerActive(id, active, scope),
    invalidate: passengersKey,
  });
}

export function useDeletePassenger() {
  return usePrivateMutation({
    mutationFn: (id: string, scope) => deletePassenger(id, scope),
    invalidate: passengersKey,
  });
}
