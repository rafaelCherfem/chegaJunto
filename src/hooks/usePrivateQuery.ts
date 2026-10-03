import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { privateQueryKeys } from "@/lib/privateQueryKeys";
import type { SessionScope } from "@/lib/sessionScope";

export function usePrivateQuery<T>(options: {
  queryKey: QueryKey;
  queryFn: (scope: SessionScope) => Promise<T>;
  enabled?: boolean;
}) {
  const { user, loading, scope } = useAuth();
  return useQuery({
    queryKey: privateQueryKeys.resource(user?.id ?? null, options.queryKey),
    enabled: !loading && Boolean(user) && options.enabled !== false,
    queryFn: async ({ signal }) => {
      scope.assertCurrent();
      const data = await options.queryFn({
        ...scope,
        signal: AbortSignal.any([signal, scope.signal]),
      });
      scope.assertCurrent();
      signal.throwIfAborted();
      return data;
    },
  });
}

export function usePrivateMutation<T, V>(options: {
  mutationFn: (variables: V, scope: SessionScope) => Promise<T>;
  invalidate?: readonly unknown[];
  invalidateAlso?: ReadonlyArray<readonly unknown[]>;
}) {
  const { scope } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationKey: privateQueryKeys.resource(scope.userId, [
      "mutation",
      ...(options.invalidate ?? []),
    ]),
    mutationFn: async (variables: V) => {
      scope.assertCurrent();
      const data = await options.mutationFn(variables, scope);
      scope.assertCurrent();
      return data;
    },
    onSuccess: () => {
      if (!scope.signal.aborted && options.invalidate) {
        return Promise.all([options.invalidate, ...(options.invalidateAlso ?? [])].map((resource) =>
          client.invalidateQueries({ queryKey: privateQueryKeys.resource(scope.userId, resource) }),
        ));
      }
    },
    retry: false,
  });
}
