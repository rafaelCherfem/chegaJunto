import { usePrivateMutation } from "@/hooks/usePrivateQuery";
import { generateMonthlyReceipt } from "@/services/pdf.service";
import { listReceivedRidesByPeriod } from "@/services/receivedRides.service";
import { listRidesByPeriod } from "@/services/rides.service";
import { downloadFile } from "@/utils/downloadFile";
import type { MonthlyCharge, Passenger } from "@/types/entities";

interface GenerateReceiptInput {
  passenger: Passenger;
  charge: MonthlyCharge;
}

export function useGenerateReceipt() {
  return usePrivateMutation({
    mutationFn: async ({ passenger, charge }: GenerateReceiptInput, scope) => {
      // Ciclo em aberto: o total ainda cresce, então não existe comprovante final.
      if (charge.extensible) throw new Error("Encerre o ciclo para gerar o comprovante.");
      // O comprovante cobre o período da própria cobrança, não o mês de calendário.
      const { periodStart, periodEnd } = charge;
      const [rides, receivedRides] = await Promise.all([
        listRidesByPeriod(periodStart, periodEnd, passenger.id, scope),
        listReceivedRidesByPeriod(periodStart, periodEnd, passenger.id, scope),
      ]);
      scope.assertCurrent();
      const bytes = await generateMonthlyReceipt({
        passenger,
        charge,
        rides,
        receivedRides,
        periodStart,
        periodEnd,
      });

      scope.assertCurrent();
      const slug = passenger.name.trim().toLowerCase().replace(/\s+/g, "-");
      downloadFile(
        bytes,
        `comprovante-${slug}-${periodStart}_a_${periodEnd}.pdf`,
        "application/pdf",
      );
    },
  });
}
