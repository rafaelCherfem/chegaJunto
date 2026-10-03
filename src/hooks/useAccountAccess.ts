import { usePrivateQuery } from "@/hooks/usePrivateQuery";
import { getMyAccountAccess } from "@/services/accountAccess.service";

export function useAccountAccess() {
  return usePrivateQuery({
    queryKey: ["accountAccess"],
    queryFn: (scope) => getMyAccountAccess(scope),
  });
}
