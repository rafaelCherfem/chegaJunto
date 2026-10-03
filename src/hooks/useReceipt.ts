import { usePrivateMutation } from "@/hooks/usePrivateQuery";
import { generateMonthlyReceipt } from "@/services/pdf.service";
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
      const rides = await listRidesByMonth(referenceMonth, passenger.id, scope);
      scope.assertCurrent();
      const bytes = await generateMonthlyReceipt({
        passenger,
        charge,
        rides,
        referenceMonth,
      });

      scope.assertCurrent();
      const slug = passenger.name.trim().toLowerCase().replace(/\s+/g, "-");
      downloadFile(bytes, `comprovante-${slug}-${referenceMonth}.pdf`, "application/pdf");
    },
  });
}
