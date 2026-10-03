import { isCalendarDate, todayISODate, FUTURE_DATE_ERROR } from "@/utils/date";
import { z } from "zod";

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
    .positive("O valor deve ser maior que zero."),
});

export type ReceivedRideFormValues = z.infer<typeof receivedRideSchema>;
