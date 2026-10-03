import { isCalendarDate, todayISODate, FUTURE_DATE_ERROR } from "@/utils/date";
import { z } from "zod";
import { toCents } from "@/utils/money";

export const receivedRideSchema = z.object({
  passengerId: z.string().min(1, "Selecione um passageiro."),
  receivedDate: z
    .string()
    .refine(isCalendarDate, "Informe uma data válida.")
    .refine(
      (value) => !isCalendarDate(value) || value <= todayISODate(),
      FUTURE_DATE_ERROR,
    ),
  amount: z.coerce
    .number({ invalid_type_error: "Informe um valor válido." })
    .positive("O valor deve ser maior que zero.")
    .refine((value) => { try { toCents(value); return true; } catch { return false; } }, "Use no máximo dois decimais."),
});

export type ReceivedRideFormValues = z.infer<typeof receivedRideSchema>;
