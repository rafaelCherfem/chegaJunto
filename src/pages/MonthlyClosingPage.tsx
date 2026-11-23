import { MonthHero } from "@/components/charges/MonthHero";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toCents } from "@/utils/money";
import { ChargeSheet } from "@/components/charges/ChargeSheet";
import { CloseCycleSheet } from "@/components/charges/CloseCycleSheet";
import {
  MonthlyChargeCard,
  type MonthlyChargeCardProps,
} from "@/components/charges/MonthlyChargeCard";
import { Button } from "@/components/ui/button";
import {
  useCycleCharges,
  useMarkMonthlyChargePaid,
  usePaymentEventsForCharges,
  useUnmarkMonthlyChargePaid,
} from "@/hooks/useMonthlyCharges";
import { usePassengers } from "@/hooks/usePassengers";
import { useReceivedRidesByPeriod } from "@/hooks/useReceivedRides";
import { useGenerateReceipt } from "@/hooks/useReceipt";
import { useRidesByPeriod } from "@/hooks/useRides";
import { latestOpenPayment } from "@/utils/chargePayments";
import { pendingCents } from "@/utils/chargeState";
import {
  buildOpenCycle,
  closeCycleMinDate,
  groupChargesByPeriodEnd,
  hasNoOpenCycle,
  latestClosedEnd,
  neverClosedPassengerIds,
  OPEN_CYCLE_KEY,
  openCycleStart,
  periodTotals,
  type PeriodTotals,
} from "@/utils/cycles";
import {
  formatDateDisplay,
  formatDayMonth,
  formatPeriodLabel,
  todayISODate,
} from "@/utils/date";
import { loadErrorKind, loadErrorMessages, reportLoadError } from "@/lib/loadErrors";
import type { MonthlyCharge, Passenger } from "@/types/entities";

function amountsMatch(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

// Uma linha da lista: a cobrança fechada (ou nada, no ciclo em aberto) e o que o passageiro
// tem de diárias e compensações no período dele.
interface CycleItem {
  passengerId: string;
  charge: MonthlyCharge | undefined;
  start: string;
  totals: PeriodTotals;
}

export function MonthlyClosingPage() {
  const today = todayISODate();
  const [selectedKey, setSelectedKey] = useState<string>(OPEN_CYCLE_KEY);

  const { data: passengers } = usePassengers(true);
  const {
    data: charges,
    isLoading: loadingCharges,
    isError: chargesError,
    error: chargesFailure,
  } = useCycleCharges();
  const chargeIds = useMemo(() => (charges ?? []).map((charge) => charge.id), [charges]);
  const { data: paymentEvents } = usePaymentEventsForCharges(chargeIds);

  const groups = useMemo(() => groupChargesByPeriodEnd(charges ?? []), [charges]);
  // Do mais recente ao mais antigo: o ciclo em aberto, depois os fechados.
  // Quando todos os passageiros já fecharam até hoje (ou depois), não existe ciclo em aberto:
  // a lista começa no ciclo fechado mais recente.
  const noOpenCycle = useMemo(
    () =>
      charges !== undefined &&
      passengers !== undefined &&
      hasNoOpenCycle(
        charges,
        neverClosedPassengerIds(
          passengers.map((passenger) => passenger.id),
          charges,
        ),
        today,
      ),
    [charges, passengers, today],
  );
  const keys = useMemo(
    () => (noOpenCycle ? groups.map((g) => g.periodEnd) : [OPEN_CYCLE_KEY, ...groups.map((g) => g.periodEnd)]),
    [groups, noOpenCycle],
  );
  const index = Math.max(0, keys.indexOf(selectedKey));
  const activeKey = keys[index]!;
  const selectedGroup = noOpenCycle ? (groups[index] ?? null) : index === 0 ? null : (groups[index - 1] ?? null);
  const lastClosing = charges ? latestClosedEnd(charges) : null;

  // Uma faixa só de diárias e compensações. Ciclo fechado: do menor início ao fim. Ciclo em
  // aberto: do menor "fim do último ciclo + 1" até hoje, mais o histórico de quem nunca fechou.
  const range = useMemo(() => {
    if (!charges) return null;
    if (selectedGroup) {
      return { start: selectedGroup.periodStart, end: selectedGroup.periodEnd, extra: [] as string[] };
    }
    if (!passengers) return null;
    return {
      // Início depois de hoje não é faixa: ninguém tem movimento em aberto entre os fechados.
      start: openCycleStart(charges, today),
      end: today,
      extra: neverClosedPassengerIds(
        passengers.map((passenger) => passenger.id),
        charges,
      ),
    };
  }, [charges, passengers, selectedGroup, today]);

  const {
    data: rides,
    isLoading: loadingRides,
    isError: ridesError,
    error: ridesFailure,
  } = useRidesByPeriod(range?.start ?? null, range?.end ?? today, range?.extra ?? [], range !== null);
  const {
    data: receivedRides,
    isLoading: loadingReceived,
    isError: receivedError,
    error: receivedFailure,
  } = useReceivedRidesByPeriod(
    range?.start ?? null,
    range?.end ?? today,
    range?.extra ?? [],
    range !== null,
  );

  const markPaid = useMarkMonthlyChargePaid();
  const unmarkPaid = useUnmarkMonthlyChargePaid();
  const generateReceipt = useGenerateReceipt();

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; key: string } | null>(null);
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  // O sheet pertence ao ciclo em que foi aberto: trocar de ciclo o fecha.
  const selectedId = selected?.key === activeKey ? selected.id : null;

  const passengersById = useMemo(() => {
    const map = new Map<string, Passenger>();
    for (const passenger of passengers ?? []) {
      map.set(passenger.id, passenger);
    }
    return map;
  }, [passengers]);

  const items = useMemo<CycleItem[]>(() => {
    const movementReady = Boolean(rides && receivedRides);
    const list: CycleItem[] = [];
    if (selectedGroup) {
      for (const charge of selectedGroup.charges) {
        list.push({
          passengerId: charge.passengerId,
          charge,
          start: charge.periodStart,
          totals: periodTotals(
            rides ?? [],
            receivedRides ?? [],
            charge.passengerId,
            charge.periodStart,
            charge.periodEnd,
          ),
        });
      }
    } else if (movementReady) {
      const open = buildOpenCycle(charges ?? [], rides ?? [], receivedRides ?? [], today);
      for (const row of open.rows) {
        list.push({ passengerId: row.passengerId, charge: undefined, start: row.start, totals: row.totals });
      }
    }
    const nameOf = (id: string) => passengersById.get(id)?.name ?? "Passageiro";
    return list.sort((a, b) => nameOf(a.passengerId).localeCompare(nameOf(b.passengerId), "pt-BR"));
  }, [selectedGroup, rides, receivedRides, charges, today, passengersById]);

  // Início do ciclo mostrado: o menor entre os passageiros listados.
  const cycleStart = useMemo(
    () => items.reduce<string | null>((min, item) => (min === null || item.start < min ? item.start : min), null),
    [items],
  );
  const periodLabel = selectedGroup
    ? formatPeriodLabel(selectedGroup.periodStart, selectedGroup.periodEnd)
    : cycleStart
      ? `${formatDateDisplay(cycleStart)} a hoje`
      : null;
  const heading = selectedGroup
    ? (periodLabel ?? "")
    : periodLabel
      ? `Ciclo em aberto: ${periodLabel}`
      : "Ciclo em aberto";

  // O que ainda falta receber nos ciclos que não são o mostrado.
  const otherOpenCents = useMemo(() => {
    let total = 0;
    for (const charge of charges ?? []) {
      if (selectedGroup && charge.periodEnd === selectedGroup.periodEnd) continue;
      total += pendingCents({
        amount: charge.totalAmount,
        paidAmount: charge.paidAmount,
        paid: charge.paid,
        status: "closed",
      });
    }
    return total;
  }, [charges, selectedGroup]);

  const itemsByPassenger = useMemo(
    () => new Map(items.map((item) => [item.passengerId, item])),
    [items],
  );

  // O mínimo só vale com o movimento do ciclo em aberto carregado (é ele que diz se alguém nunca fechou).
  const closeMinDate = useMemo(() => {
    if (!charges || !rides || !receivedRides || selectedGroup) return undefined;
    const movementIds = new Set([
      ...rides.map((ride) => ride.passengerId),
      ...receivedRides.map((received) => received.passengerId),
    ]);
    return closeCycleMinDate(charges, movementIds, today);
  }, [charges, rides, receivedRides, selectedGroup, today]);

  function openCloseSheet() {
    // O seletor parte do ciclo em aberto, que é o que o movimento carregado descreve.
    setSelectedKey(OPEN_CYCLE_KEY);
    setCloseSheetOpen(true);
  }

  async function handleMarkPaid(chargeId: string, revision: number) {
    setActionError(null);
    setTogglingId(chargeId);

    try {
      await markPaid.mutateAsync({ id: chargeId, revision });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o pagamento.",
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function handleUnmarkPaid(chargeId: string, paymentId: string) {
    setActionError(null);
    setTogglingId(chargeId);

    try {
      await unmarkPaid.mutateAsync({ id: chargeId, paymentId });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o pagamento.",
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function handleGenerateReceipt(passenger: Passenger, charge: MonthlyCharge) {
    setActionError(null);
    setGeneratingId(charge.id);

    try {
      await generateReceipt.mutateAsync({ passenger, charge });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Não foi possível gerar o comprovante.",
      );
    } finally {
      setGeneratingId(null);
    }
  }

  function chargeProps(item: CycleItem): MonthlyChargeCardProps {
    const rideAmount = item.totals.rideCents / 100;
    const compensationAmount = item.totals.compensationCents / 100;
    const computed = item.totals.totalCents / 100;
    const stored = item.charge;
    const passenger = passengersById.get(item.passengerId);
    const passengerName = passenger?.name ?? "Passageiro";
    const sinceLabel =
      cycleStart !== null && item.start > cycleStart
        ? `desde ${formatDayMonth(item.start)}`
        : undefined;

    if (!stored) {
      return {
        passengerName,
        amount: computed,
        status: "preview",
        rideAmount,
        compensationAmount,
        paid: false,
        sinceLabel,
        toggling: false,
        generatingReceipt: false,
        onMarkPaid: () => {},
        onUnmarkPaid: () => {},
        onGenerateReceipt: () => {},
        onOpenDetails: () => setSelected({ id: item.passengerId, key: activeKey }),
      };
    }

    const outdated = !amountsMatch(stored.totalAmount, computed);
    const cancelablePaymentId = latestOpenPayment(
      paymentEvents ?? [],
      stored.id,
      stored.paidAmount,
    );

    return {
      passengerName,
      amount: stored.totalAmount,
      status: outdated ? "outdated" : "closed",
      computedAmount: outdated ? computed : undefined,
      rideAmount,
      compensationAmount,
      paid: stored.paid,
      paidAmount: stored.paidAmount,
      canUnmarkPaid: cancelablePaymentId !== null,
      sinceLabel,
      toggling: togglingId === stored.id,
      generatingReceipt: generatingId === stored.id,
      onMarkPaid: () => handleMarkPaid(stored.id, stored.revision),
      onUnmarkPaid: () =>
        cancelablePaymentId && handleUnmarkPaid(stored.id, cancelablePaymentId),
      onGenerateReceipt: () => passenger && handleGenerateReceipt(passenger, stored),
      onOpenDetails: () => setSelected({ id: item.passengerId, key: activeKey }),
    };
  }

  function sheetLabel(item: CycleItem): string {
    return item.charge
      ? formatPeriodLabel(item.charge.periodStart, item.charge.periodEnd)
      : `${formatDateDisplay(item.start)} a hoje`;
  }

  const failures = [
    chargesError ? { label: "cobranças", error: chargesFailure } : null,
    ridesError ? { label: "diárias", error: ridesFailure } : null,
    receivedError ? { label: "compensações", error: receivedFailure } : null,
  ].filter((failure) => failure !== null);
  useEffect(() => {
    if (chargesError) reportLoadError("Cobranças: consulta de cobranças", chargesFailure);
    if (ridesError) reportLoadError("Cobranças: consulta de diárias", ridesFailure);
    if (receivedError) reportLoadError("Cobranças: consulta de compensações", receivedFailure);
  }, [chargesError, chargesFailure, ridesError, ridesFailure, receivedError, receivedFailure]);

  const loading = loadingCharges || loadingRides || loadingReceived;
  const ready = !loading && !chargesError && !ridesError && !receivedError && charges && rides && receivedRides;
  const selectedItem = selectedId ? itemsByPassenger.get(selectedId) : undefined;

  return (
    <div className="page--charges mx-auto space-y-5 p-6">
      <h1 className="page-heading">Cobranças</h1>

      <div className="month-controls">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ciclo anterior"
          title="Ciclo anterior"
          disabled={index >= keys.length - 1}
          onClick={() => setSelectedKey(keys[index + 1]!)}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <span className="min-w-0 text-center text-sm font-semibold tabular-nums">
          {heading}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo ciclo"
          title="Próximo ciclo"
          disabled={index === 0}
          onClick={() => setSelectedKey(keys[index - 1]!)}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      {noOpenCycle && lastClosing && (
        <p role="status" className="text-sm text-muted-foreground">
          Sem ciclo em aberto: o último fechamento vai até {formatDateDisplay(lastClosing)}
        </p>
      )}

      <Button onClick={openCloseSheet} disabled={noOpenCycle}>
        Calcular fechamento
      </Button>
      {noOpenCycle && lastClosing && (
        <p className="text-sm text-muted-foreground">
          Todos os passageiros já estão fechados até {formatDateDisplay(lastClosing)}. Para fechar
          de novo, é preciso haver movimento novo.
        </p>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando...
        </p>
      )}

      {failures.length > 0 && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>
            Não foi possível carregar os ciclos de cobrança.{" "}
            {
              loadErrorMessages[
                failures.some((failure) => loadErrorKind(failure.error) === "network") ? "network" : "data"
              ]
            }
          </p>
          <p>Consulta com falha: {failures.map((failure) => failure.label).join(", ")}.</p>
        </div>
      )}

      {ready && items.length === 0 && (
        <p className="text-sm opacity-70">
          {charges.length === 0
            ? "Nenhuma diária registrada ainda."
            : "Nenhuma diária ou compensação em aberto desde o último fechamento."}
        </p>
      )}

      {ready && (
        <MonthHero
          monthLabel={periodLabel ?? "ciclo em aberto"}
          otherOpenCents={otherOpenCents}
          rows={items.map((item) => {
            const computed = item.totals.totalCents / 100;
            const stored = item.charge;
            return {
              amount: stored?.totalAmount ?? computed,
              paidAmount: stored?.paidAmount ?? 0,
              paid: stored?.paid ?? false,
              status: !stored
                ? "preview"
                : amountsMatch(stored.totalAmount, computed)
                  ? "closed"
                  : "outdated",
            };
          })}
        />
      )}
      <div className="financial-list">
        {items.map((item) => (
          <MonthlyChargeCard key={item.passengerId} {...chargeProps(item)} />
        ))}
      </div>

      {closeSheetOpen && (
        <CloseCycleSheet
          today={today}
          minDate={closeMinDate}
          nameOf={(id) => passengersById.get(id)?.name ?? "Passageiro"}
          onClosed={(rows, endDate) => {
            // O ciclo criado termina na data escolhida; os dados novos chegam com a invalidação.
            setSelectedKey(rows.find((row) => row.status === "CLOSED")?.periodEnd ?? endDate);
          }}
          onDismiss={() => setCloseSheetOpen(false)}
        />
      )}

      {selectedItem && (
        <ChargeSheet
          {...chargeProps(selectedItem)}
          monthLabel={sheetLabel(selectedItem)}
          open
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  );
}
