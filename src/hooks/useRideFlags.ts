import { usePrivateQuery, usePrivateMutation } from "@/hooks/usePrivateQuery";
import {
  createRideFlag,
  listUnresolvedFlags,
  resolveFlag,
} from "@/services/rideFlags.service";

const flagsKey = ["rideFlags"] as const;

export function useUnresolvedFlags() {
  return usePrivateQuery({
    queryKey: flagsKey,
    queryFn: (scope) => listUnresolvedFlags(scope),
  });
}

export function useFlagRide() {
  return usePrivateMutation({
    mutationFn: (rideId: string, scope) => createRideFlag(rideId, scope),
  });
}

export function useResolveFlag() {
  return usePrivateMutation({
    mutationFn: (flagId: string, scope) => resolveFlag(flagId, scope),
    invalidate: flagsKey,
  });
}
