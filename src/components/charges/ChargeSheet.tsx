import { Check, FileText, Undo2 } from "lucide-react";
import type { MonthlyChargeCardProps } from "@/components/charges/MonthlyChargeCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { chargeState } from "@/utils/chargeState";
import { formatCurrency } from "@/utils/currency";
import { debtLabel, toCents } from "@/utils/money";

interface ChargeSheetProps extends Omit<MonthlyChargeCardProps, "onOpenDetails"> {
  monthLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChargeSheet({ monthLabel, open, onOpenChange, ...props }: ChargeSheetProps) {
  const { settled, partial, cents, paidCents, outstandingCents, refundCents, hasObligation } =
    chargeState(props);
  const closed = props.status === "closed";
  const showPay = closed && hasObligation && !settled;
  // "Desmarcar" desfaz o pagamento mais recente ainda válido, também numa cobrança
  // parcial: canUnmarkPaid já vem de latestOpenPayment, igual à regra do banco.
  const showUnmark = closed && hasObligation && props.canUnmarkPaid === true;
  const hasRides = toCents(props.rideAmount) !== 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <header className="sheet__header pr-12">
          <p className="stat-label">Cobrança · {monthLabel}</p>
          <SheetTitle className="mt-1.5 break-words text-xl font-extrabold [overflow-wrap:anywhere]">
            {props.passengerName}
          </SheetTitle>
        </header>

        <SheetDescription asChild>
          <div className="mt-3">
            <p className="stat-value break-words text-[2.25rem] leading-10 [overflow-wrap:anywhere]">
              {formatCurrency(props.amount)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settled && hasObligation ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Pagamento recebido
                </span>
              ) : (
                debtLabel(partial ? outstandingCents : cents)
              )}
            </p>
          </div>
        </SheetDescription>

        <dl className="sheet__details mt-4">
          {hasRides && (
            <div>
              <dt>Diárias</dt>
              <dd>{formatCurrency(props.rideAmount)}</dd>
            </div>
          )}
          {props.compensationAmount > 0 && (
            <div>
              <dt>Compensação</dt>
              <dd>−{formatCurrency(props.compensationAmount)}</dd>
            </div>
          )}
          <div>
            <dt>Total do mês</dt>
            <dd>{formatCurrency(props.amount)}</dd>
          </div>
          {paidCents !== 0 && (
            <div>
              <dt>Já pago</dt>
              <dd>{formatCurrency(paidCents / 100)}</dd>
            </div>
          )}
          {partial && (
            <div>
              <dt>Falta pagar</dt>
              <dd>{formatCurrency(outstandingCents / 100)}</dd>
            </div>
          )}
          {refundCents > 0 && (
            <div>
              <dt>Saldo a devolver</dt>
              <dd>{formatCurrency(refundCents / 100)}</dd>
            </div>
          )}
        </dl>

        {props.status === "outdated" && props.computedAmount !== undefined && (
          <p className="mt-3 text-sm tabular-nums text-muted-foreground">
            Total atualizado seria {formatCurrency(props.computedAmount)} — recalcule para
            atualizar.
          </p>
        )}

        <div className="sheet__actions">
          {showPay && (
            <Button
              disabled={props.toggling}
              aria-busy={props.toggling}
              onClick={props.onMarkPaid}
            >
              {partial ? `Pagar ${formatCurrency(outstandingCents / 100)}` : "Marcar como pago"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={props.generatingReceipt || props.status === "outdated"}
            aria-busy={props.generatingReceipt}
            onClick={props.onGenerateReceipt}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            Gerar comprovante
          </Button>
        </div>

        {showUnmark && (
          <div className="sheet__undo">
            <Button
              variant="ghost"
              size="sm"
              disabled={props.toggling}
              aria-busy={props.toggling}
              onClick={props.onUnmarkPaid}
            >
              <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Desmarcar pagamento
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
