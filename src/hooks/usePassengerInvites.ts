import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createPassengerInvite,
  listPassengerInvites,
  revokePassengerInvite,
} from "@/services/passengerAccounts.service";

export function usePassengerInvites(passengerId: string, enabled: boolean) {
  return usePrivateQuery({
    queryKey: ["passengerInvites", passengerId],
    queryFn: (scope) => listPassengerInvites(passengerId, scope),
    enabled,
  });
}

export function useCreatePassengerInvite() {
  return usePrivateMutation({
    mutationFn: (passengerId: string, scope) => createPassengerInvite(passengerId, scope),
    invalidate: ["passengerInvites"],
  });
}

export function useRevokePassengerInvite() {
  return usePrivateMutation({
    mutationFn: (id: string, scope) => revokePassengerInvite(id, scope),
    invalidate: ["passengerInvites"],
  });
}
