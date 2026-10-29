import { BillingSummary } from "@/components/charges/BillingSummary";
import { CompleteMark } from "@/components/ui/complete-mark";
import { useCountUp } from "@/hooks/useCountUp";
import { formatCurrency } from "@/utils/currency";
import { chargeState } from "@/utils/chargeState";
import { addCents } from "@/utils/money";

type BillingRow = {
  amount: number;
  paidAmount?: number;
  paid: boolean;
  status: "closed" | "preview" | "outdated";
};

interface MonthHeroProps {
  rows: BillingRow[];
  monthLabel: string;
}

export function MonthHero({ rows, monthLabel }: MonthHeroProps) {
  const closed = rows.filter((row) => row.status === "closed");
  // Só valores a favor entram no total a receber; saldos negativos e o que
  // foi pago a mais são mostrados à parte para não se compensarem no destaque.
  let pendingCents = 0;
  let paidCents = 0;
  let refundCents = 0;
  let unsettled = 0;
  for (const row of closed) {
    const state = chargeState(row);
    if (state.hasObligation && !state.settled) unsettled += 1;
    refundCents = addCents(refundCents, state.refundCents);
    if (state.isRefund) continue;
    const covered = state.settled
      ? state.cents
      : Math.min(Math.max(state.paidCents, 0), state.cents);
    paidCents = addCents(paidCents, covered);
    pendingCents = addCents(pendingCents, state.cents - covered);
  }

  const totalCents = addCents(pendingCents, paidCents);
  // Mês fechado e recebido: algo a receber existiu, nada ficou em aberto e não há
  // prévia nem cobrança desatualizada esperando cálculo. Um saldo a devolver não
  // impede o selo; a linha de saldo a devolver continua visível abaixo.
  const allReceived =
    totalCents > 0 &&
    unsettled === 0 &&
    rows.every((row) => row.status === "closed");
  const paidShare = totalCents > 0 ? (paidCents / totalCents) * 100 : 0;
  const animated = useCountUp(pendingCents / 100);

  return (
    <section className="month-hero" aria-labelledby="month-hero-title">
      <p id="month-hero-title" className="stat-label first-letter:uppercase">
        A receber em {monthLabel}
      </p>

      <p className="stat-value mt-2.5 text-[clamp(2rem,10.5vw,2.75rem)] leading-none">
        <span className="sr-only">{formatCurrency(pendingCents / 100)}</span>
        <span aria-hidden="true">{formatCurrency(animated)}</span>
      </p>

      {allReceived && (
        <div className="mt-3">
          <CompleteMark>Tudo recebido</CompleteMark>
        </div>
      )}

      {totalCents > 0 && (
        <>
          <div className="month-hero__bar" aria-hidden="true">
            <span
              className="month-hero__bar-paid"
              style={{ width: `${paidShare}%` }}
            />
          </div>
          <div className="month-hero__legend">
            <span>
              <span className="month-hero__dot month-hero__dot--paid" aria-hidden="true" />
              <strong className="tabular-nums">{formatCurrency(paidCents / 100)}</strong>{" "}
              pago
            </span>
            <span>
              <span
                className="month-hero__dot month-hero__dot--pending"
                aria-hidden="true"
              />
              <strong className="tabular-nums">
                {formatCurrency(pendingCents / 100)}
              </strong>{" "}
              em aberto
            </span>
          </div>
        </>
      )}

      {refundCents > 0 && (
        <p className="month-hero__refund mt-3 text-sm tabular-nums">
          Saldo a devolver: {formatCurrency(refundCents / 100)}
        </p>
      )}

      <BillingSummary rows={rows} />
    </section>
  );
}
