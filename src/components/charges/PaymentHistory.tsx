import { formatCurrency } from "@/utils/currency";
import { paymentDate } from "@/utils/chargePayments";

export interface SheetPayment {
  id: string;
  /** Timestamp do banco; a tela mostra a data no fuso de São Paulo. */
  occurredAt: string;
  amount: number;
}

interface PaymentHistoryProps {
  /** Pagamentos vigentes, do mais recente para o mais antigo. */
  payments: ReadonlyArray<SheetPayment>;
  /** Cobrança com total negativo: os valores são devoluções feitas ao passageiro. */
  refund: boolean;
}

export function PaymentHistory({ payments, refund }: PaymentHistoryProps) {
  if (payments.length === 0) return null;
  return (
    <section className="sheet__history" aria-label={refund ? "Devoluções feitas" : "Pagamentos registrados"}>
      <p className="stat-label">{refund ? "Devoluções feitas" : "Pagamentos"}</p>
      <ul className="mt-1.5 grid gap-1.5 text-sm">
        {payments.map((payment, index) => (
          <li key={payment.id} className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">
              {paymentDate(payment.occurredAt)}
              {index === 0 && payments.length > 1 && " · mais recente"}
            </span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(refund ? Math.abs(payment.amount) : payment.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
