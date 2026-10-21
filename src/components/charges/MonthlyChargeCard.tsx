import { Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/currency";
import { debtLabel, toCents } from "@/utils/money";
interface MonthlyChargeCardProps {
  passengerName: string;
  amount: number;
  status: "closed" | "preview" | "outdated";
  computedAmount?: number | undefined;
  rideAmount: number;
  compensationAmount: number;
  paid: boolean;
  paidAmount?: number;
  toggling: boolean;
  generatingReceipt: boolean;
  onMarkPaid: () => void;
  onUnmarkPaid: () => void;
  onGenerateReceipt: () => void;
}
export function MonthlyChargeCard(props: MonthlyChargeCardProps) {
  const cents = toCents(props.amount);
  const paidCents = toCents(props.paidAmount ?? 0);
  const outstandingCents = cents - paidCents;
  const settled = props.status === "closed" && props.paid;
  const partial = props.status === "closed" && !props.paid && paidCents !== 0;
  const refundCents = settled && cents >= 0 && paidCents > cents ? paidCents - cents : 0;
  return (
    <div className="surface min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 basis-32 break-words [overflow-wrap:anywhere] text-base font-semibold leading-6">
          {props.passengerName}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {props.status !== "closed" && (
            <span className="charge-status charge-status--neutral">
              {props.status === "preview" ? "Prévia" : "Desatualizado"}
            </span>
          )}
          {settled && (cents !== 0 || paidCents !== 0) && (
            <span className="charge-status charge-status--paid">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Pago
            </span>
          )}
          {partial && (
            <span className="charge-status charge-status--pending">Parcialmente pago</span>
          )}
          {props.status === "closed" && !props.paid && !partial && cents !== 0 && (
            <span className="charge-status charge-status--pending">Pendente</span>
          )}
        </div>
      </div>
      <p className="mt-3 break-words [overflow-wrap:anywhere] text-2xl font-semibold leading-8 tracking-tight tabular-nums">
        {formatCurrency(props.amount)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{debtLabel(partial ? outstandingCents : cents)}</p>
      {partial && (
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          Já pago: {formatCurrency(paidCents / 100)} · Falta pagar:{" "}
          {formatCurrency(outstandingCents / 100)}
        </p>
      )}
      {refundCents > 0 && (
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          Já pago: {formatCurrency(paidCents / 100)} · Saldo a devolver:{" "}
          {formatCurrency(refundCents / 100)}
        </p>
      )}
      {props.compensationAmount > 0 && (
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          Diárias: {formatCurrency(props.rideAmount)} · Compensação: −
          {formatCurrency(props.compensationAmount)}
        </p>
      )}
      {props.status === "outdated" && props.computedAmount !== undefined && (
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          Total atualizado seria {formatCurrency(props.computedAmount)} — recalcule para
          atualizar.
        </p>
      )}
      {props.status !== "preview" && (
        <div className="charge-actions">
          {props.status === "closed" &&
            (cents !== 0 || paidCents !== 0) &&
            (settled ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={props.toggling}
                aria-busy={props.toggling}
                onClick={props.onUnmarkPaid}
              >
                Desmarcar pagamento
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={props.toggling}
                aria-busy={props.toggling}
                onClick={props.onMarkPaid}
              >
                {partial ? `Pagar ${formatCurrency(outstandingCents / 100)}` : "Marcar como pago"}
              </Button>
            ))}
          <Button
            variant="outline"
            size="sm"
            disabled={props.generatingReceipt || props.status === "outdated"}
            aria-busy={props.generatingReceipt}
            onClick={props.onGenerateReceipt}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            Gerar comprovante
          </Button>
        </div>
      )}
    </div>
  );
}
