import { chargeState } from "@/utils/chargeState";

type BillingRow = {
  amount: number;
  paidAmount?: number;
  paid: boolean;
  status: "closed" | "preview" | "outdated";
};

export function BillingSummary({ rows }: { rows: BillingRow[] }) {
  const obligations = rows
    .filter((row) => row.status === "closed")
    .map(chargeState)
    .filter((state) => state.hasObligation);
  const pending = obligations.filter((state) => state.open).length;
  const paid = obligations.length - pending;
  const previews = rows.filter((row) => row.status === "preview").length;
  const outdated = rows.filter((row) => row.status === "outdated").length;
  return (
    <div
      className="context-summary context-summary--billing"
      aria-label="Situação da competência"
    >
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Obrigações atuais</p>
        <p className="text-xl font-semibold tabular-nums">
          {pending} {pending === 1 ? "pendente" : "pendentes"}{" "}
          <span className="text-sm font-medium text-muted-foreground">
            · {paid} {paid === 1 ? "paga" : "pagas"}
          </span>
        </p>
      </div>
      {(previews > 0 || outdated > 0) && (
        <p className="max-w-sm text-sm text-muted-foreground">
          {`${previews} ${previews === 1 ? "prévia" : "prévias"} · ${outdated} ${outdated === 1 ? "desatualizada" : "desatualizadas"} — fora da contagem.`}
        </p>
      )}
    </div>
  );
}
