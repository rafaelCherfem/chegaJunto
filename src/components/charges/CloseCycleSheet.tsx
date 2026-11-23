import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { errorMessages } from "@/constants/errorMessages";
import { useCloseCycle, usePreviewCycle } from "@/hooks/useMonthlyCharges";
import { formatCurrency } from "@/utils/currency";
import { formatDateDisplay, isCalendarDate } from "@/utils/date";
import type { CycleSummaryRow } from "@/types/entities";

interface CloseCycleSheetProps {
  today: string;
  /** Só conveniência: a prévia do banco é quem decide o que fecha. */
  minDate?: string | undefined;
  nameOf: (passengerId: string) => string;
  /** Chamado depois que o fechamento gravou, com o resumo devolvido pelo banco. */
  onClosed: (rows: CycleSummaryRow[], endDate: string) => void;
  onDismiss: () => void;
}

type PreviewState =
  | { date: string; phase: "loading" }
  | { date: string; phase: "ready"; rows: CycleSummaryRow[] }
  | { date: string; phase: "error"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : errorMessages.unexpected;
}

function passengersLabel(count: number): string {
  return count === 1 ? "1 passageiro" : `${count} passageiros`;
}

interface CycleSummaryProps {
  rows: CycleSummaryRow[];
  endDate: string;
  verb: "Fechar" | "Ciclo fechado";
  nameOf: (passengerId: string) => string;
}

function CycleSummary({ rows, endDate, verb, nameOf }: CycleSummaryProps) {
  const byName = (a: CycleSummaryRow, b: CycleSummaryRow) =>
    nameOf(a.passengerId).localeCompare(nameOf(b.passengerId), "pt-BR");
  const closed = rows.filter((row) => row.status === "CLOSED").sort(byName);
  const noMovement = rows.filter((row) => row.status === "NO_MOVEMENT").sort(byName);
  const skippedByEnd = new Map<string, CycleSummaryRow[]>();
  for (const row of rows.filter((item) => item.status === "SKIPPED").sort(byName)) {
    const end = row.periodEnd ?? "";
    skippedByEnd.set(end, [...(skippedByEnd.get(end) ?? []), row]);
  }

  const start = closed.reduce<string | null>(
    (min, row) => (row.periodStart && (min === null || row.periodStart < min) ? row.periodStart : min),
    null,
  );

  return (
    <div className="mt-4 space-y-4">
      {closed.length > 0 ? (
        <>
          <p className="text-sm font-semibold tabular-nums">
            {verb}
            {start ? ` de ${formatDateDisplay(start)}` : ""} a {formatDateDisplay(endDate)} para{" "}
            {passengersLabel(closed.length)}
          </p>
          <dl className="sheet__details">
            {closed.map((row) => (
              <div key={row.passengerId}>
                <dt>{nameOf(row.passengerId)}</dt>
                <dd>{formatCurrency(row.totalAmount ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Nada a fechar neste período
        </p>
      )}

      {Array.from(skippedByEnd, ([end, list]) => (
        <section key={end}>
          <p className="stat-label">{end ? `Já fechados até ${formatDateDisplay(end)}` : "Já fechados"}</p>
          <ul className="mt-1 text-sm text-muted-foreground">
            {list.map((row) => (
              <li key={row.passengerId}>{nameOf(row.passengerId)}</li>
            ))}
          </ul>
        </section>
      ))}

      {noMovement.length > 0 && (
        <section>
          <p className="stat-label">Sem movimento no período</p>
          <ul className="mt-1 text-sm text-muted-foreground">
            {noMovement.map((row) => (
              <li key={row.passengerId}>{nameOf(row.passengerId)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function CloseCycleSheet({ today, minDate, nameOf, onClosed, onDismiss }: CloseCycleSheetProps) {
  const previewCycle = usePreviewCycle();
  const closeCycle = useCloseCycle();
  // As funções vão por ref para o efeito da prévia rodar só quando a data muda.
  const previewRef = useRef(previewCycle.mutateAsync);
  previewRef.current = previewCycle.mutateAsync;

  const [date, setDate] = useState(today);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [result, setResult] = useState<{ rows: CycleSummaryRow[]; date: string } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    setCloseError(null);
    if (!isCalendarDate(date)) {
      setPreview(null);
      return;
    }
    const id = ++requestId.current;
    setPreview({ date, phase: "loading" });
    previewRef
      .current(date)
      .then((rows) => {
        if (id === requestId.current) setPreview({ date, phase: "ready", rows });
      })
      .catch((error: unknown) => {
        if (id === requestId.current) setPreview({ date, phase: "error", message: messageOf(error) });
      });
    // Uma resposta que chegar depois da troca de data (ou do fechamento do sheet) é descartada.
    return () => {
      requestId.current += 1;
    };
  }, [date]);

  const closedRows = useMemo(
    () => (preview?.date === date && preview.phase === "ready" ? preview.rows : []).filter((row) => row.status === "CLOSED"),
    [preview, date],
  );
  const canClose = result === null && !closing && closedRows.length > 0;

  async function handleClose() {
    if (!canClose || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setCloseError(null);
    try {
      const rows = await closeCycle.mutateAsync(date);
      setResult({ rows, date });
      onClosed(rows, date);
    } catch (error) {
      setCloseError(messageOf(error));
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  }

  const current = preview?.date === date ? preview : null;

  return (
    <Sheet open onOpenChange={(open) => !open && !closing && onDismiss()}>
      <SheetContent>
        <header className="sheet__header pr-12">
          <p className="stat-label">Fechamento</p>
          <SheetTitle className="mt-1.5 text-xl font-extrabold">
            {result ? "Ciclo fechado" : "Calcular fechamento"}
          </SheetTitle>
        </header>

        <SheetDescription className="mt-2 text-sm text-muted-foreground">
          {result
            ? "Resumo devolvido pelo fechamento."
            : "Escolha a data final do ciclo. Nada é gravado até você confirmar."}
        </SheetDescription>

        {result ? (
          <CycleSummary rows={result.rows} endDate={result.date} verb="Ciclo fechado" nameOf={nameOf} />
        ) : (
          <>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="close-cycle-date">Data final do ciclo</Label>
              <Input
                id="close-cycle-date"
                type="date"
                value={date}
                min={minDate}
                max={today}
                disabled={closing}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            {!isCalendarDate(date) && (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                Escolha uma data para ver a prévia.
              </p>
            )}
            {current?.phase === "loading" && (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                Calculando a prévia...
              </p>
            )}
            {current?.phase === "error" && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {current.message}
              </p>
            )}
            {current?.phase === "ready" && (
              <CycleSummary rows={current.rows} endDate={date} verb="Fechar" nameOf={nameOf} />
            )}
          </>
        )}

        {closeError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {closeError}
          </p>
        )}

        <div className="sheet__actions">
          {result ? (
            <Button onClick={onDismiss}>Concluir</Button>
          ) : (
            <Button disabled={!canClose} aria-busy={closing} onClick={handleClose}>
              Fechar ciclo
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
