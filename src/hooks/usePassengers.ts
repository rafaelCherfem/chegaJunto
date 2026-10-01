import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  return useQuery({
    queryKey: [...passengersKey, { includeInactive }],
    queryFn: () => listPassengers(includeInactive),
  });
}

export function usePassenger(id: string) {
  return useQuery({
    queryKey: [...passengersKey, id],
    queryFn: () => getPassenger(id),
    enabled: Boolean(id),
  });
}

export function useCreatePassenger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePassengerInput) => createPassenger(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengersKey });
    },
  });
}

export function useUpdatePassenger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePassengerInput }) =>
      updatePassenger(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengersKey });
    },
  });
}

export function useSetPassengerActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setPassengerActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengersKey });
    },
  });
}

export function useDeletePassenger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePassenger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengersKey });
    },
  });
}
