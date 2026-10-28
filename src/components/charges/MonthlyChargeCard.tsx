import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { RefundChip } from "@/components/charges/RefundChip";
import { Button } from "@/components/ui/button";
import { chargeState, type ChargeStatus } from "@/utils/chargeState";
import { formatCurrency } from "@/utils/currency";
import { debtLabel } from "@/utils/money";
import { initials } from "@/utils/initials";

export interface MonthlyChargeCardProps {
  passengerName: string;
  amount: number;
  status: ChargeStatus;
  computedAmount?: number | undefined;
  rideAmount: number;
  compensationAmount: number;
  paid: boolean;
  paidAmount?: number;
  canUnmarkPaid?: boolean;
  toggling: boolean;
  generatingReceipt: boolean;
  onMarkPaid: () => void;
  onUnmarkPaid: () => void;
  onGenerateReceipt: () => void;
  /** Abre o sheet de detalhes. Sem ele, o resumo do card não é interativo. */
  onOpenDetails?: (() => void) | undefined;
}

export function MonthlyChargeCard(props: MonthlyChargeCardProps) {
  const { settled, partial, cents, paidCents, outstandingCents, refundCents, hasObligation } =
    chargeState(props);
  const showPayAction = props.status === "closed" && hasObligation && !settled;
  const summary = (
    <>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={settled ? "avatar avatar--done" : "avatar avatar--due"}
        >
          {initials(props.passengerName)}
        </span>
        <p className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-base font-semibold leading-10">
          {props.passengerName}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 py-2.5">
          {props.status !== "closed" && (
            <span className="charge-status charge-status--neutral">
              {props.status === "preview" ? "Prévia" : "Desatualizado"}
            </span>
          )}
          {refundCents > 0 && <RefundChip />}
          {settled && hasObligation && refundCents === 0 && (
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
      <p className="stat-value mt-3 break-words text-[2rem] leading-9 [overflow-wrap:anywhere]">
        {formatCurrency(props.amount)}
      </p>
      {settled && hasObligation ? (
        <p className="mt-1 text-sm text-muted-foreground">Pagamento recebido</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {debtLabel(partial ? outstandingCents : cents)}
        </p>
      )}
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
    </>
  );

  return (
    <div className="surface min-w-0 p-4 sm:p-5">
      {props.onOpenDetails ? (
        <Summary onClick={props.onOpenDetails}>{summary}</Summary>
      ) : (
        <div>{summary}</div>
      )}
      {showPayAction && (
        <div className="charge-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={props.toggling}
            aria-busy={props.toggling}
            onClick={props.onMarkPaid}
          >
            {partial ? `Pagar ${formatCurrency(outstandingCents / 100)}` : "Marcar como pago"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Summary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="charge-card__summary"
      aria-haspopup="dialog"
      onClick={onClick}
    >
      {children}
      <ChevronRight className="charge-card__chevron" aria-hidden="true" />
    </button>
  );
}
