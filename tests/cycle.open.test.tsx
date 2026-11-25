import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthHero } from "@/components/charges/MonthHero";
import { StaleObligationError } from "@/lib/cycleErrors";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";
import type { ChargePaymentEvent, CycleSummaryRow } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  events: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  preview: vi.fn(),
  close: vi.fn(),
  pay: vi.fn(),
  unpay: vi.fn(),
  receipt: vi.fn(),
  refetchCharges: vi.fn(),
  refetchEvents: vi.fn(),
}));
vi.mock("@/hooks/useMonthlyCharges", () => ({
  useCycleCharges: mocks.charges,
  usePaymentEventsForCharges: mocks.events,
  useMarkMonthlyChargePaid: () => ({ mutateAsync: mocks.pay }),
  useUnmarkMonthlyChargePaid: () => ({ mutateAsync: mocks.unpay }),
  usePreviewCycle: () => ({ mutateAsync: mocks.preview }),
  useCloseCycle: () => ({ mutateAsync: mocks.close }),
}));
vi.mock("@/hooks/usePassengers", () => ({
  usePassengers: () => ({
    data: [
      { id: "A", name: "Ana" },
      { id: "B", name: "Bia" },
      { id: "C", name: "Caio" },
    ],
  }),
}));
vi.mock("@/hooks/useRides", () => ({ useRidesByPeriod: mocks.rides }));
vi.mock("@/hooks/useReceivedRides", () => ({ useReceivedRidesByPeriod: mocks.received }));
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: mocks.receipt }) }));

// Hoje: 10/12/2026. A cobrança de novembro de Ana ficou aberta e já passou de 30/11.
const TODAY = "2026-12-10";

const baseCharge = {
  referenceMonth: "2026-11-01",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  paid: false,
  paidAmount: 0,
  paidAt: null,
  createdAt: "",
  activePaymentId: null,
  revision: 1,
  extensible: false,
};
const openCharge = (overrides: Record<string, unknown> = {}) => ({
  ...baseCharge,
  id: "CA",
  passengerId: "A",
  totalAmount: 150,
  paidAmount: 80,
  revision: 5,
  extensible: true,
  ...overrides,
});
const closedB = { ...baseCharge, id: "CB", passengerId: "B", totalAmount: 20 };
const ride = (id: string, passengerId: string, rideDate: string, rateCharged: number) => ({ id, passengerId, rideDate, rateCharged });
// 100 em novembro + 50 já depois de 30/11 = 150, igual ao total vivo gravado.
const anaRides = [ride("r1", "A", "2026-11-10", 100), ride("r2", "A", "2026-12-03", 50)];

const payment = (id: string, revision: number, signedAmount: number): ChargePaymentEvent => ({
  id,
  monthlyChargeId: "CA",
  kind: "PAYMENT",
  revision,
  signedAmount,
  relatedPaymentId: null,
  occurredAt: `2026-11-${String(10 + revision).padStart(2, "0")}T15:00:00Z`,
});

function setData({
  charges = [openCharge(), closedB],
  rides = anaRides,
  events = [] as ChargePaymentEvent[],
  fetching = false,
}: { charges?: unknown[]; rides?: unknown[]; events?: ChargePaymentEvent[]; fetching?: boolean } = {}) {
  mocks.charges.mockReturnValue({ data: charges, isFetching: fetching, refetch: mocks.refetchCharges });
  mocks.events.mockReturnValue({ data: events, isFetching: false, refetch: mocks.refetchEvents });
  mocks.rides.mockReturnValue({ data: rides });
  mocks.received.mockReturnValue({ data: [] });
}

const money = (value: string) => new RegExp(`R\\$\\s*${value.replace(".", "\\.")}`);
const openDetails = () => {
  const summary = screen.getAllByRole("button").find((button) => button.getAttribute("aria-haspopup") === "dialog");
  fireEvent.click(summary!);
  return screen.getByRole("dialog");
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const row = (passengerId: string, status: CycleSummaryRow["status"], extra: Partial<CycleSummaryRow> = {}): CycleSummaryRow => ({
  passengerId,
  status,
  reason: status === "SKIPPED" ? "ALREADY_CLOSED_UNTIL" : null,
  chargeId: null,
  periodStart: status === "SKIPPED" ? null : "2026-11-01",
  periodEnd: status === "SKIPPED" ? "2026-11-30" : TODAY,
  totalAmount: null,
  paidAmount: null,
  amountDue: null,
  refundDue: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  setData();
  mocks.pay.mockResolvedValue({});
  mocks.unpay.mockResolvedValue({});
  mocks.preview.mockResolvedValue([]);
  mocks.close.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("the open cycle shows once, as the open cycle", () => {
  it("is the heading, with the stored (live) total, 'Pago até agora' and what is missing", () => {
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 01/11/2026 a hoje")).toBeTruthy();
    expect(screen.getAllByText("Ana")).toHaveLength(1);
    expect(screen.getByText("Ciclo em aberto", { selector: "span" })).toBeTruthy();
    // Total vivo (150), já pago (80) e o que falta (70), sem "30/11" em lugar nenhum.
    expect(screen.getAllByText(money("150,00")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Já pago: R\$\s80,00 · Falta pagar:\s*R\$\s70,00/)).toBeTruthy();
    expect(screen.queryByText(/30\/11\/2026/)).toBeNull();
  });

  it("is not listed again among the closed cycles", () => {
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    // O único ciclo fechado é o de Bia; Ana não aparece nele.
    expect(screen.getByText("01/11/2026 a 30/11/2026")).toBeTruthy();
    expect(screen.getByText("Bia")).toBeTruthy();
    expect(screen.queryByText("Ana")).toBeNull();
    expect((screen.getByLabelText("Ciclo anterior") as HTMLButtonElement).disabled).toBe(true);
  });

  it("an extensible charge alone makes exactly one cycle: the open one", () => {
    setData({ charges: [openCharge()] });
    render(<MonthlyClosingPage />);
    expect((screen.getByLabelText("Ciclo anterior") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Próximo ciclo") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Ciclo em aberto: 01/11/2026 a hoje")).toBeTruthy();
  });

  it("does not show the 'last period' notice while a cycle is open", () => {
    setToday("2026-11-23");
    setData({ charges: [openCharge({ totalAmount: 150 })], rides: anaRides });
    render(<MonthlyClosingPage />);
    expect(screen.queryByText(/Último período/)).toBeNull();
    expect(screen.queryByText(/Todos os passageiros já estão fechados/)).toBeNull();
  });

  it("with an open cycle, 'Em aberto em outros ciclos' does not repeat what is already on screen", () => {
    render(<MonthlyClosingPage />);
    // Ana (70 a pagar) está na tela; Bia (20) é de outro ciclo.
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s20,00/)).toBeTruthy();
  });

  it("seen from a closed cycle, the open cycle's balance is the 'other' one", () => {
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s70,00/)).toBeTruthy();
  });
});

function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
}

describe("'Em dia até hoje' never becomes 'Tudo recebido' while the cycle is open", () => {
  const settled = (open: boolean) => ({ amount: 150, paidAmount: 150, paid: true, status: "closed" as const, open });

  it("MonthHero: open and nothing missing says 'Em dia até hoje'", () => {
    render(<MonthHero monthLabel="01/11/2026 a hoje" rows={[settled(true)]} />);
    expect(screen.getByText("Em dia até hoje")).toBeTruthy();
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    expect(screen.getByText(/pago até agora/)).toBeTruthy();
  });

  it("MonthHero: the same rows, closed, say 'Tudo recebido'", () => {
    render(<MonthHero monthLabel="novembro" rows={[settled(false)]} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    expect(screen.queryByText("Em dia até hoje")).toBeNull();
    expect(screen.queryByText(/pago até agora/)).toBeNull();
  });

  it("MonthHero: one open row is enough to avoid 'Tudo recebido' for the others", () => {
    render(<MonthHero monthLabel="x" rows={[settled(false), settled(true)]} />);
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    expect(screen.getByText("Em dia até hoje")).toBeTruthy();
  });

  it("MonthHero: with something missing there is no mark at all", () => {
    render(<MonthHero monthLabel="x" rows={[{ amount: 150, paidAmount: 80, paid: false, status: "closed", open: true }]} />);
    expect(screen.queryByText("Em dia até hoje")).toBeNull();
    expect(screen.queryByText("Tudo recebido")).toBeNull();
  });

  it("the page: fully paid open cycle says 'Em dia até hoje' and the card 'Pago até agora'", () => {
    setData({ charges: [openCharge({ paid: true, paidAmount: 150 })] });
    render(<MonthlyClosingPage />);
    expect(screen.getAllByText("Em dia até hoje").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    expect(screen.getByText("Pago até agora")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pagar tudo até hoje" })).toBeNull();
  });

  it("the page: a closed, fully paid cycle still says 'Tudo recebido'", () => {
    setData({ charges: [{ ...closedB, paid: true, paidAmount: 20 }], rides: [ride("rb", "B", "2026-11-05", 20)] });
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    expect(screen.queryByText("Em dia até hoje")).toBeNull();
  });
});

describe("pay everything until today", () => {
  it("the button on the card uses the existing pay_charge with the charge's revision", async () => {
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Pagar tudo até hoje" }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledTimes(1));
    expect(mocks.pay).toHaveBeenCalledWith({ id: "CA", revision: 5 });
  });

  it("the same action is in the sheet, with the remaining amount as the context", async () => {
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    const button = within(dialog).getByRole("button", { name: "Pagar tudo até hoje" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith({ id: "CA", revision: 5 }));
    expect(within(dialog).getByText("Pago até agora")).toBeTruthy();
  });

  it("a closed cycle keeps the old wording", () => {
    setData({ charges: [openCharge({ extensible: false, periodEnd: "2026-12-10" })] });
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    expect(screen.queryByRole("button", { name: "Pagar tudo até hoje" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Pagar R\$\s70,00$/ })).toBeTruthy();
  });

  it("a second click while the first is running does not send another payment", async () => {
    const pending = deferred<unknown>();
    mocks.pay.mockReturnValue(pending.promise);
    render(<MonthlyClosingPage />);
    const button = screen.getByRole("button", { name: "Pagar tudo até hoje" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.pay).toHaveBeenCalledTimes(1);
    pending.resolve({});
    await waitFor(() => expect((screen.getByRole("button", { name: "Pagar tudo até hoje" }) as HTMLButtonElement).disabled).toBe(false));
    expect(mocks.pay).toHaveBeenCalledTimes(1);
  });

  it("is off while the data is being refreshed", () => {
    setData({ fetching: true });
    render(<MonthlyClosingPage />);
    const button = screen.getByRole("button", { name: "Pagar tudo até hoje" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.pay).not.toHaveBeenCalled();
  });
});

describe("undo points at the latest payment still in force", () => {
  const events = [payment("e1", 1, 50), payment("e2", 3, 30)];

  it("cancels the most recent one and says how much it is", async () => {
    setData({ events, charges: [openCharge({ paidAmount: 80 })] });
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    expect(within(dialog).getByText(/Desfaz o último pagamento: R\$\s30,00/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Desmarcar pagamento" }));
    await waitFor(() => expect(mocks.unpay).toHaveBeenCalledTimes(1));
    expect(mocks.unpay).toHaveBeenCalledWith({ id: "CA", paymentId: "e2" });
  });

  it("skips a payment that was already cancelled", async () => {
    const cancel: ChargePaymentEvent = { id: "x", monthlyChargeId: "CA", kind: "CANCEL", revision: 4, signedAmount: -30, relatedPaymentId: "e2", occurredAt: "2026-11-14T15:00:00Z" };
    setData({ events: [...events, cancel], charges: [openCharge({ paidAmount: 50 })] });
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    expect(within(dialog).getByText(/Desfaz o último pagamento: R\$\s50,00/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Desmarcar pagamento" }));
    await waitFor(() => expect(mocks.unpay).toHaveBeenCalledWith({ id: "CA", paymentId: "e1" }));
  });

  it("is off while the data is being refreshed", () => {
    setData({ events, charges: [openCharge({ paidAmount: 80 })], fetching: true });
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    expect((within(dialog).getByRole("button", { name: "Desmarcar pagamento" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("STALE_OBLIGATION", () => {
  it("reloads the data and tells the user nothing was done", async () => {
    mocks.pay.mockRejectedValue(new StaleObligationError());
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Pagar tudo até hoje" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("A cobrança mudou e a tela foi atualizada. Confira os valores e repita a operação.");
    expect(mocks.refetchCharges).toHaveBeenCalledTimes(1);
    expect(mocks.refetchEvents).toHaveBeenCalledTimes(1);
    // Solta o botão para repetir a operação.
    expect((screen.getByRole("button", { name: "Pagar tudo até hoje" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("also when undoing", async () => {
    setData({ events: [payment("e1", 1, 80)], charges: [openCharge({ paidAmount: 80 })] });
    mocks.unpay.mockRejectedValue(new StaleObligationError());
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    fireEvent.click(within(dialog).getByRole("button", { name: "Desmarcar pagamento" }));
    await waitFor(() => expect(mocks.refetchCharges).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/a tela foi atualizada/)).toBeTruthy();
  });

  it("any other error shows its own message and does not reload", async () => {
    mocks.pay.mockRejectedValue(new Error("Nenhum valor pendente para registrar pagamento."));
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Pagar tudo até hoje" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nenhum valor pendente para registrar pagamento.");
    expect(mocks.refetchCharges).not.toHaveBeenCalled();
  });
});

describe("the receipt is blocked while the cycle is open", () => {
  it("disables the button and says why", () => {
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    const button = within(dialog).getByRole("button", { name: "Gerar comprovante" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(dialog).getByText("Encerre o ciclo para gerar o comprovante.")).toBeTruthy();
    expect(button.getAttribute("aria-describedby")).toBe("receipt-blocked");
    fireEvent.click(button);
    expect(mocks.receipt).not.toHaveBeenCalled();
  });

  it("a closed charge still generates it", () => {
    setData({ charges: [openCharge({ extensible: false, periodEnd: "2026-12-10" })] });
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    const dialog = openDetails();
    expect((within(dialog).getByRole("button", { name: "Gerar comprovante" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).queryByText(/Encerre o ciclo/)).toBeNull();
  });

  it("the sheet of the open cycle is labelled 'a hoje', not with the stored 30/11", () => {
    render(<MonthlyClosingPage />);
    const dialog = openDetails();
    expect(within(dialog).getByText(/Cobrança · 01\/11\/2026 a hoje/)).toBeTruthy();
    expect(within(dialog).queryByText(/30\/11\/2026/)).toBeNull();
  });
});

describe("'Calcular fechamento' with an open cycle", () => {
  const calc = () => screen.getByRole("button", { name: "Calcular fechamento" }) as HTMLButtonElement;

  it("is enabled even though the stored period is a whole month that already ended", () => {
    render(<MonthlyClosingPage />);
    expect(calc().disabled).toBe(false);
    expect(screen.queryByText(/está sendo ajustado/)).toBeNull();
  });

  it("is enabled before the end of the month too (the cycle is open until the user closes it)", () => {
    setToday("2026-11-23");
    setData({ charges: [openCharge()] });
    render(<MonthlyClosingPage />);
    expect(calc().disabled).toBe(false);
  });

  it("opens the confirmation with today as the default date and the open cycle's start as the minimum", async () => {
    render(<MonthlyClosingPage />);
    fireEvent.click(calc());
    const input = (await screen.findByLabelText("Data final do ciclo")) as HTMLInputElement;
    expect(input.value).toBe(TODAY);
    expect(input.min).toBe("2026-11-01");
    expect(input.max).toBe(TODAY);
  });
});

describe("the confirmation for an open cycle", () => {
  const extended = [
    row("A", "EXTENDED", { chargeId: "CA", totalAmount: 150, paidAmount: 80, amountDue: 70, refundDue: 0 }),
    row("B", "SKIPPED"),
    row("C", "NO_MOVEMENT", { periodStart: "2026-12-01" }),
  ];
  const openSheet = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Calcular fechamento" }));
    return screen.findByText(/Encerrar o ciclo de/);
  };

  it("spells out the whole period and, per passenger, total, paid and to pay", async () => {
    mocks.preview.mockResolvedValue(extended);
    render(<MonthlyClosingPage />);
    expect((await openSheet()).textContent).toBe("Encerrar o ciclo de 01/11/2026 até 10/12/2026 para 1 passageiro");
    const dialog = screen.getByRole("dialog");
    expect(mocks.preview).toHaveBeenCalledWith(TODAY);
    const ana = within(dialog).getByText("Ana").parentElement as HTMLElement;
    const text = ana.textContent!.replace(/\s/g, " ");
    expect(text).toContain("Total do ciclo");
    expect(text).toMatch(/R\$ 150,00/);
    expect(text).toMatch(/Já pago.*R\$ 80,00/);
    expect(text).toMatch(/A pagar.*R\$ 70,00/);
    expect(text).not.toContain("Saldo a devolver");
    expect(within(dialog).getByText("Já fechados até 30/11/2026")).toBeTruthy();
    expect(within(dialog).getByText("Bia")).toBeTruthy();
    expect(within(dialog).getByText("Sem movimento no período")).toBeTruthy();
    expect(within(dialog).queryByText("Nada a fechar neste período")).toBeNull();
  });

  it("shows the balance to refund when the passenger paid more than the total", async () => {
    mocks.preview.mockResolvedValue([row("A", "EXTENDED", { chargeId: "CA", totalAmount: 100, paidAmount: 130, amountDue: 0, refundDue: 30 })]);
    render(<MonthlyClosingPage />);
    await openSheet();
    const text = within(screen.getByRole("dialog")).getByText("Ana").parentElement!.textContent!.replace(/\s/g, " ");
    expect(text).toMatch(/A pagar.*R\$ 0,00/);
    expect(text).toMatch(/Saldo a devolver.*R\$ 30,00/);
  });

  it("works without the new columns (database without 0014): what is missing comes from total and paid", async () => {
    mocks.preview.mockResolvedValue([row("A", "EXTENDED", { chargeId: "CA", totalAmount: 150, paidAmount: 80 })]);
    render(<MonthlyClosingPage />);
    await openSheet();
    expect(within(screen.getByRole("dialog")).getByText("Ana").parentElement!.textContent!.replace(/\s/g, " ")).toMatch(/A pagar.*R\$ 70,00/);
  });

  it("the 'Encerrar ciclo' button is enabled with only EXTENDED rows and closes with the chosen date", async () => {
    mocks.preview.mockResolvedValue(extended);
    mocks.close.mockResolvedValue([row("A", "EXTENDED", { chargeId: "CA", totalAmount: 150, paidAmount: 80, amountDue: 70, refundDue: 0 })]);
    render(<MonthlyClosingPage />);
    await openSheet();
    const button = screen.getByRole("button", { name: "Encerrar ciclo" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(TODAY));
    // O resumo vem do que o closeCycle devolveu.
    expect((await screen.findByText(/Ciclo encerrado de/)).textContent).toBe("Ciclo encerrado de 01/11/2026 até 10/12/2026 para 1 passageiro");
    expect(screen.getByText("Concluir")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Encerrar ciclo" })).toBeNull();
  });

  it("mixes open and new cycles: both groups, and the button counts both", async () => {
    mocks.preview.mockResolvedValue([
      row("A", "EXTENDED", { chargeId: "CA", totalAmount: 150, paidAmount: 80, amountDue: 70, refundDue: 0 }),
      row("C", "CLOSED", { totalAmount: 12.5, periodStart: "2026-12-05" }),
    ]);
    render(<MonthlyClosingPage />);
    await openSheet();
    expect(screen.getByText("Fechar de 05/12/2026 a 10/12/2026 para 1 passageiro")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Encerrar ciclo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled, with 'Nada a fechar', when there is nothing to close or extend", async () => {
    mocks.preview.mockResolvedValue([row("C", "NO_MOVEMENT")]);
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular fechamento" }));
    expect(await screen.findByText("Nada a fechar neste período")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Encerrar ciclo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
