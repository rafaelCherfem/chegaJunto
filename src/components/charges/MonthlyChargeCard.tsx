import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  toggling: boolean;
  generatingReceipt: boolean;
  onMarkPaid: () => void;
  onUnmarkPaid: () => void;
  onGenerateReceipt: () => void;
}
export function MonthlyChargeCard(props: MonthlyChargeCardProps) {
  const cents = toCents(props.amount);
  const settled = props.status === "closed" && props.paid;
  return <div className={cn("surface p-4", settled && cents !== 0 && "ring-2 ring-primary/50")}>
    <div className="flex items-center justify-between gap-2">
      <p className="font-medium">{props.passengerName}</p>
      <div className="flex items-center gap-1.5">
        {props.status !== "closed" && <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{props.status === "preview" ? "Prévia" : "Desatualizado"}</span>}
        {settled && cents !== 0 && <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"><Check className="h-3 w-3" />Pago</span>}
        {props.status === "closed" && !props.paid && cents !== 0 && <span className="text-xs">Pendente</span>}
      </div>
    </div>
    <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(props.amount)}</p>
    <p className="mt-1 text-xs opacity-70">{debtLabel(cents)}</p>
    {props.compensationAmount > 0 && <p className="mt-1 text-xs opacity-70">Diárias: {formatCurrency(props.rideAmount)} · Compensação: −{formatCurrency(props.compensationAmount)}</p>}
    {props.status === "outdated" && props.computedAmount !== undefined && <p className="mt-1 text-xs opacity-70">Total atualizado seria {formatCurrency(props.computedAmount)} — recalcule para atualizar.</p>}
    {props.status !== "preview" && <div className="mt-3 flex flex-wrap gap-2">
      {props.status === "closed" && cents !== 0 && (settled ?
        <Button variant="outline" size="sm" disabled={props.toggling} onClick={props.onUnmarkPaid}>Desmarcar pagamento</Button> :
        <Button size="sm" disabled={props.toggling} onClick={props.onMarkPaid}>Marcar como pago</Button>)}
      <Button variant="outline" size="sm" disabled={props.generatingReceipt || props.status === "outdated"} onClick={props.onGenerateReceipt}>Gerar comprovante</Button>
    </div>}
  </div>;
}
