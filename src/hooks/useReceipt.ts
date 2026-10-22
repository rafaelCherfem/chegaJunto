import { usePrivateMutation } from "@/hooks/usePrivateQuery";
import { generateMonthlyReceipt } from "@/services/pdf.service";
import { listReceivedRidesByMonth } from "@/services/receivedRides.service";
import { listRidesByMonth } from "@/services/rides.service";
import { downloadFile } from "@/utils/downloadFile";
import type { MonthlyCharge, Passenger } from "@/types/entities";

interface GenerateReceiptInput {
  passenger: Passenger;
  charge: MonthlyCharge;
  referenceMonth: string;
}

export function useGenerateReceipt() {
  return usePrivateMutation({
    mutationFn: async (
      { passenger, charge, referenceMonth }: GenerateReceiptInput,
      scope,
    ) => {
      const [rides, receivedRides] = await Promise.all([
        listRidesByMonth(referenceMonth, passenger.id, scope),
        listReceivedRidesByMonth(referenceMonth, passenger.id, scope),
      ]);
      scope.assertCurrent();
      const bytes = await generateMonthlyReceipt({
        passenger,
        charge,
        rides,
        receivedRides,
        referenceMonth,
      });

      scope.assertCurrent();
      const slug = passenger.name.trim().toLowerCase().replace(/\s+/g, "-");
      downloadFile(bytes, `comprovante-${slug}-${referenceMonth}.pdf`, "application/pdf");
    },
  });
}
