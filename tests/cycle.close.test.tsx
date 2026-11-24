import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapCycleError, type CycleErrorToken } from "@/lib/cycleErrors";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";
import type { CycleStatus, CycleSummaryRow } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  preview: vi.fn(),
  close: vi.fn(),
  pay: vi.fn(),
  unpay: vi.fn(),
}));
vi.mock("@/hooks/useMonthlyCharges", () => ({
  useCycleCharges: mocks.charges,
  usePaymentEventsForCharges: () => ({ data: [] }),
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
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: vi.fn() }) }));

// Hoje, em São Paulo: 10/12/2026.
const TODAY = "2026-12-10";

const charge = (id: string, passengerId: string, periodStart: string, periodEnd: string, totalAmount: number) => ({
  id,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  totalAmount,
  paid: false,
  paidAmount: 0,
  revision: 1,
  activePaymentId: null,
});
// Ana e Bia fecharam até 6/dez.
const closedCharges = [
  charge("CA", "A", "2026-11-01", "2026-12-06", 30),
  charge("CB", "B", "2026-11-05", "2026-12-06", 20),
];
const ride = (id: string, passengerId: string, rideDate: string, rateCharged: number) => ({ id, passengerId, rideDate, rateCharged });

const row = (passengerId: string, status: CycleStatus, extra: Partial<CycleSummaryRow> = {}): CycleSummaryRow => ({
  passengerId,
  status,
  reason: status === "SKIPPED" ? "ALREADY_CLOSED_UNTIL" : null,
  chargeId: null,
  periodStart: status === "SKIPPED" ? null : "2026-12-07",
  periodEnd: status === "SKIPPED" ? "2026-12-06" : TODAY,
  totalAmount: status === "CLOSED" ? 10 : null, paidAmount: null, amountDue: null, refundDue: null,
  ...extra,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setData({ charges = closedCharges, rides = [ride("a-open", "A", "2026-12-08", 10)] } = {}) {
  mocks.charges.mockReturnValue({ data: charges });
  mocks.rides.mockReturnValue({ data: rides });
  mocks.received.mockReturnValue({ data: [] });
}

const openSheet = () => fireEvent.click(screen.getByRole("button", { name: "Calcular fechamento" }));
const dateInput = () => screen.getByLabelText("Data final do ciclo") as HTMLInputElement;
const closeButton = () => screen.getByRole("button", { name: "Encerrar ciclo" }) as HTMLButtonElement;
const changeDate = (value: string) => fireEvent.change(dateInput(), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  setData();
  mocks.preview.mockResolvedValue([row("A", "CLOSED")]);
  mocks.close.mockResolvedValue([row("A", "CLOSED", { chargeId: "new" })]);
});
afterEach(() => vi.useRealTimers());

describe("the calculate button", () => {
  it("is enabled and opens the confirmation with the focus inside it", async () => {
    render(<MonthlyClosingPage />);
    const button = screen.getByRole("button", { name: "Calcular fechamento" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes nothing by itself: opening only previews", async () => {
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

describe("the date selector", () => {
  it("starts today, with today as the maximum", () => {
    render(<MonthlyClosingPage />);
    openSheet();
    expect(dateInput().value).toBe(TODAY);
    expect(dateInput().max).toBe(TODAY);
  });

  it("has the day after the smallest last end as the minimum when everyone with movement already closed", () => {
    render(<MonthlyClosingPage />);
    openSheet();
    expect(dateInput().min).toBe("2026-12-07");
  });

  it("has the smallest of the last ends, not the first cycle's", () => {
    setData({ charges: [...closedCharges, charge("CA0", "A", "2026-10-01", "2026-10-31", 5), charge("CB2", "B", "2026-12-07", "2026-12-08", 5)] });
    render(<MonthlyClosingPage />);
    openSheet();
    // Última de Ana: 6/dez. Última da Bia: 8/dez. O menor é 6/dez, então o mínimo é 7/dez.
    expect(dateInput().min).toBe("2026-12-07");
  });

  it("has no minimum when someone with movement never closed", () => {
    setData({ rides: [ride("a-open", "A", "2026-12-08", 10), ride("c-open", "C", "2026-12-05", 15)] });
    render(<MonthlyClosingPage />);
    openSheet();
    expect(dateInput().min).toBe("");
  });

  it("has no minimum when nobody closed yet", () => {
    setData({ charges: [] });
    render(<MonthlyClosingPage />);
    openSheet();
    expect(dateInput().min).toBe("");
  });

  it("is a labelled field", () => {
    render(<MonthlyClosingPage />);
    openSheet();
    expect(screen.getByLabelText("Data final do ciclo")).toBe(dateInput());
  });
});

describe("the preview", () => {
  it("asks for today and shows the three categories with the dates in full", async () => {
    mocks.preview.mockResolvedValue([
      row("A", "CLOSED", { totalAmount: 12.5 }),
      row("C", "CLOSED", { totalAmount: 7, periodStart: "2026-12-05" }),
      row("B", "SKIPPED"),
      row("D", "NO_MOVEMENT"),
    ]);
    render(<MonthlyClosingPage />);
    openSheet();

    expect(await screen.findByText("Fechar de 05/12/2026 a 10/12/2026 para 2 passageiros")).toBeTruthy();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenCalledWith(TODAY);

    const dialog = screen.getByRole("dialog");
    const ana = within(dialog).getByText("Ana").closest("div") as HTMLElement;
    expect(ana.textContent?.replace(/\s/g, " ")).toContain("R$ 12,50");
    expect(within(dialog).getByText("Caio")).toBeTruthy();
    expect(within(dialog).getByText("Já fechados até 06/12/2026")).toBeTruthy();
    expect(within(dialog).getByText("Bia")).toBeTruthy();
    expect(within(dialog).getByText("Sem movimento no período")).toBeTruthy();
    // D não está na lista de passageiros da página: aparece com o nome genérico.
    expect(within(dialog).getByText("Passageiro")).toBeTruthy();
  });

  it("uses the singular for one passenger", async () => {
    render(<MonthlyClosingPage />);
    openSheet();
    expect(await screen.findByText("Fechar de 07/12/2026 a 10/12/2026 para 1 passageiro")).toBeTruthy();
  });

  it("asks again when the date changes", async () => {
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    changeDate("2026-12-09");
    await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith("2026-12-09"));
    expect(mocks.preview).toHaveBeenCalledTimes(2);
  });

  it("does not ask while the date is empty", async () => {
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    changeDate("");
    expect(await screen.findByText("Escolha uma data para ver a prévia.")).toBeTruthy();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(closeButton().disabled).toBe(true);
  });
});

describe("the 'Encerrar ciclo' button", () => {
  it("is disabled until the preview comes back, then enabled", async () => {
    const pending = deferred<CycleSummaryRow[]>();
    mocks.preview.mockReturnValue(pending.promise);
    render(<MonthlyClosingPage />);
    openSheet();
    expect(closeButton().disabled).toBe(true);
    expect(screen.getByText("Calculando a prévia...")).toBeTruthy();

    pending.resolve([row("A", "CLOSED")]);
    await screen.findByText(/Fechar de/);
    expect(closeButton().disabled).toBe(false);
  });

  it("is disabled again while the preview of a changed date is pending", async () => {
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    expect(closeButton().disabled).toBe(false);

    const next = deferred<CycleSummaryRow[]>();
    mocks.preview.mockReturnValue(next.promise);
    changeDate("2026-12-09");
    expect(closeButton().disabled).toBe(true);

    next.resolve([row("A", "CLOSED")]);
    await waitFor(() => expect(closeButton().disabled).toBe(false));
  });

  it("is disabled, with 'Nada a fechar', when no row is CLOSED", async () => {
    mocks.preview.mockResolvedValue([row("D", "NO_MOVEMENT")]);
    render(<MonthlyClosingPage />);
    openSheet();
    expect(await screen.findByText("Nada a fechar neste período")).toBeTruthy();
    expect(closeButton().disabled).toBe(true);
    expect(screen.getByText("Sem movimento no período")).toBeTruthy();
  });

  it("is disabled when the preview failed", async () => {
    mocks.preview.mockRejectedValue(new Error("A data de fim não pode ser futura."));
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByRole("alert");
    expect(closeButton().disabled).toBe(true);
  });

  it("is disabled while the closing call is pending", async () => {
    const pending = deferred<CycleSummaryRow[]>();
    mocks.close.mockReturnValue(pending.promise);
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    fireEvent.click(closeButton());
    await waitFor(() => expect(closeButton().disabled).toBe(true));
    pending.resolve([row("A", "CLOSED")]);
    await screen.findByText("Concluir");
  });
});

describe("a stale preview", () => {
  it("does not enable the button for the new date", async () => {
    const first = deferred<CycleSummaryRow[]>();
    const second = deferred<CycleSummaryRow[]>();
    mocks.preview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<MonthlyClosingPage />);
    openSheet();
    changeDate("2026-12-09");
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));

    // A prévia de hoje volta com CLOSED depois de a data já ter mudado.
    first.resolve([row("A", "CLOSED")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(closeButton().disabled).toBe(true);
    expect(screen.queryByText(/Fechar de/)).toBeNull();

    // E a da data nova, sem CLOSED, é a que vale.
    second.resolve([row("A", "NO_MOVEMENT")]);
    expect(await screen.findByText("Nada a fechar neste período")).toBeTruthy();
    expect(closeButton().disabled).toBe(true);
  });

  it("does not overwrite the new date's preview when it arrives last", async () => {
    const first = deferred<CycleSummaryRow[]>();
    const second = deferred<CycleSummaryRow[]>();
    mocks.preview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<MonthlyClosingPage />);
    openSheet();
    changeDate("2026-12-09");
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));

    second.resolve([row("A", "CLOSED", { totalAmount: 42 })]);
    await screen.findByText("Fechar de 07/12/2026 a 09/12/2026 para 1 passageiro");
    first.resolve([row("A", "NO_MOVEMENT")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(closeButton().disabled).toBe(false);
    expect(screen.queryByText("Nada a fechar neste período")).toBeNull();
  });
});

describe("preview errors", () => {
  const cases: Array<[CycleErrorToken, string, string]> = [
    ["INVALID_CYCLE_END", "23514", "Escolha uma data de fim válida."],
    ["FUTURE_DATE", "23514", "A data de fim não pode ser futura."],
    ["CYCLE_OVERLAP", "23514", "Este período se sobrepõe a um ciclo já fechado."],
    ["BEFORE_FIRST_CYCLE", "23514", "Esta data é anterior ao primeiro fechamento do passageiro."],
    ["FINANCIAL_FORBIDDEN", "42501", "Você não tem permissão para esta operação."],
  ];

  it.each(cases)("%s becomes its message in Portuguese", async (token, code, message) => {
    mocks.preview.mockRejectedValue(mapCycleError({ code, message: token, hint: null }));
    render(<MonthlyClosingPage />);
    openSheet();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(closeButton().disabled).toBe(true);
  });

  it("uses the database hint, with the dates in full", async () => {
    mocks.preview.mockRejectedValue(
      mapCycleError({ code: "23514", message: "CYCLE_OVERLAP", hint: "Já existe ciclo fechado até 2026-12-06." }),
    );
    render(<MonthlyClosingPage />);
    openSheet();
    expect((await screen.findByRole("alert")).textContent).toBe("Já existe ciclo fechado até 06/12/2026.");
  });
});

describe("closing", () => {
  it("calls closeCycle once with the chosen date, shows the returned summary and opens the new cycle", async () => {
    mocks.preview.mockResolvedValue([row("A", "CLOSED", { totalAmount: 10 })]);
    // O banco devolve um total diferente da prévia: a tela mostra o devolvido.
    mocks.close.mockImplementation(async () => {
      mocks.charges.mockReturnValue({
        data: [charge("NEW", "A", "2026-12-07", "2026-12-09", 15), ...closedCharges],
      });
      return [row("A", "CLOSED", { chargeId: "NEW", totalAmount: 15, periodEnd: "2026-12-09" })];
    });
    render(<MonthlyClosingPage />);
    openSheet();
    changeDate("2026-12-09");
    await screen.findByText("Fechar de 07/12/2026 a 09/12/2026 para 1 passageiro");

    fireEvent.click(closeButton());

    expect(await screen.findByText("Ciclo fechado de 07/12/2026 a 09/12/2026 para 1 passageiro")).toBeTruthy();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledWith("2026-12-09");
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent?.replace(/\s/g, " ")).toContain("R$ 15,00");
    expect(dialog.textContent?.replace(/\s/g, " ")).not.toContain("R$ 10,00");
    // O ciclo criado está aberto na página, por trás do resumo.
    expect(screen.getByText("07/12/2026 a 09/12/2026")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("07/12/2026 a 09/12/2026")).toBeTruthy();
  });

  it("a double click makes a single call", async () => {
    const pending = deferred<CycleSummaryRow[]>();
    mocks.close.mockReturnValue(pending.promise);
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    const button = closeButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    pending.resolve([row("A", "CLOSED")]);
    await screen.findByText("Concluir");
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the sheet open with the message when it fails, and lets the user try again", async () => {
    mocks.close.mockRejectedValueOnce(mapCycleError({ code: "23514", message: "CYCLE_OVERLAP", hint: null }));
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);

    fireEvent.click(closeButton());
    const alert = await screen.findByText("Este período se sobrepõe a um ciclo já fechado.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Concluir")).toBeNull();
    await waitFor(() => expect(closeButton().disabled).toBe(false));

    fireEvent.click(closeButton());
    expect(await screen.findByText("Concluir")).toBeTruthy();
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });

  it("shows an unexpected failure as the generic message", async () => {
    mocks.close.mockRejectedValueOnce("falha de rede");
    render(<MonthlyClosingPage />);
    openSheet();
    await screen.findByText(/Fechar de/);
    fireEvent.click(closeButton());
    expect(await screen.findByText("Não foi possível concluir a operação. Tente novamente.")).toBeTruthy();
  });
});

describe("payments are untouched", () => {
  it("still pays and unmarks from a closed cycle", async () => {
    mocks.pay.mockResolvedValue({});
    // Diárias que batem com os totais fechados (30 e 20), senão o card sai como "Desatualizado".
    setData({ rides: [ride("a", "A", "2026-11-10", 30), ride("b", "B", "2026-11-06", 20)] });
    render(<MonthlyClosingPage />);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    fireEvent.click(screen.getAllByText("Marcar como pago")[0]!);
    expect(mocks.pay).toHaveBeenCalledWith({ id: expect.any(String), revision: 1 });
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
