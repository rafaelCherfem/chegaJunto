import { usePrivateQuery } from "@/hooks/usePrivateQuery";
import { getMyPassengerAccount } from "@/services/passengerAccounts.service";

export function useMyPassengerAccount() {
  return usePrivateQuery({
    queryKey: ["myPassengerAccount"],
    queryFn: (scope) => getMyPassengerAccount(scope),
  });
}
