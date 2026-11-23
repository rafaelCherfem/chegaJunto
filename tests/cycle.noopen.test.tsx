import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadError } from "@/lib/loadErrors";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  events: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  passengers: vi.fn(),
}));
vi.mock("@/hooks/useMonthlyCharges", () => ({
  useCycleCharges: mocks.charges,
  usePaymentEventsForCharges: mocks.events,
  useMarkMonthlyChargePaid: () => ({ mutateAsync: vi.fn() }),
  useUnmarkMonthlyChargePaid: () => ({ mutateAsync: vi.fn() }),
  usePreviewCycle: () => ({ mutateAsync: vi.fn().mockResolvedValue([]) }),
  useCloseCycle: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/usePassengers", () => ({ usePassengers: mocks.passengers }));
vi.mock("@/hooks/useRides", () => ({ useRidesByPeriod: mocks.rides }));
vi.mock("@/hooks/useReceivedRides", () => ({ useReceivedRidesByPeriod: mocks.received }));
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: vi.fn() }) }));

const charge = (id: string, passengerId: string, periodStart: string, periodEnd: string) => ({
  id,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  totalAmount: 100,
  paid: false,
  paidAmount: 0,
  revision: 1,
  activePaymentId: null,
});
const ride = (id: string, passengerId: string, rideDate: string, rateCharged: number) => ({ id, passengerId, rideDate, rateCharged });

function setData(charges: unknown[], people: { id: string; name: string }[], rides: unknown[] = []) {
  mocks.charges.mockReturnValue({ data: charges });
  mocks.rides.mockReturnValue({ data: rides });
  mocks.received.mockReturnValue({ data: [] });
  mocks.passengers.mockReturnValue({ data: people });
}
function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
}
const calcButton = () => screen.getByRole("button", { name: "Calcular fechamento" }) as HTMLButtonElement;
// Nunca pode haver consulta de diárias ou compensações com o início depois do fim.
function expectNoInvertedRange() {
  for (const mock of [mocks.rides, mocks.received]) {
    for (const [start, end] of mock.mock.calls as [string | null, string][]) {
      if (start !== null) expect(start <= end, `faixa invertida ${start} > ${end}`).toBe(true);
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  mocks.events.mockReturnValue({ data: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("no open cycle: every closed passenger is closed through today or later", () => {
  // O estado exato do seed local de 23/11/2026.
  const seedPeople = [
    { id: "ana", name: "Ana" },
    { id: "carlos", name: "Carlos" },
    { id: "marina", name: "Marina" },
    { id: "joao", name: "João" },
    { id: "fernanda", name: "Fernanda" },
  ];
  const seedCharges = [
    ...["ana", "carlos", "marina", "joao"].map((id) => charge(`${id}-nov`, id, "2026-11-01", "2026-11-30")),
    ...["ana", "carlos", "marina", "joao"].map((id) => charge(`${id}-out`, id, "2026-10-01", "2026-10-31")),
    charge("fernanda-1", "fernanda", "2026-10-01", "2026-11-23"),
  ];

  it("seed regression: opens on the latest closed cycle, shows the notice and no error", () => {
    setToday("2026-11-23");
    setData(seedCharges, seedPeople);
    render(<MonthlyClosingPage />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Ciclo em aberto/)).toBeNull();
    expect(screen.getByText("01/11/2026 a 30/11/2026")).toBeTruthy();
    expect(screen.getByText("Sem ciclo em aberto: o último fechamento vai até 30/11/2026")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    expectNoInvertedRange();
    // Só o ciclo fechado que está na tela é consultado, nunca uma faixa do ciclo em aberto.
    expect(mocks.rides).toHaveBeenLastCalledWith("2026-11-01", "2026-11-30", [], true);
    expect(mocks.received).toHaveBeenLastCalledWith("2026-11-01", "2026-11-30", [], true);
  });

  it("disables 'Calcular fechamento' and explains why", () => {
    setToday("2026-11-23");
    setData(seedCharges, seedPeople);
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(true);
    expect(
      screen.getByText(
        "Todos os passageiros já estão fechados até 30/11/2026. Para fechar de novo, é preciso haver movimento novo.",
      ),
    ).toBeTruthy();
    fireEvent.click(calcButton());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the arrows still walk the closed cycles, with no open cycle in front", () => {
    setToday("2026-11-23");
    setData(seedCharges, seedPeople);
    render(<MonthlyClosingPage />);
    expect((screen.getByLabelText("Próximo ciclo") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Ciclo anterior"));
    expect(screen.getByText("01/10/2026 a 23/11/2026")).toBeTruthy();
    expect(screen.getByText("Fernanda")).toBeTruthy();
    expect(screen.queryByText(/Ciclo em aberto/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Próximo ciclo"));
    expect(screen.getByText("01/11/2026 a 30/11/2026")).toBeTruthy();
  });

  it("end of month: last end seven days after today opens without error", () => {
    setToday("2026-11-23");
    setData([charge("a", "A", "2026-11-01", "2026-11-30")], [{ id: "A", name: "Ana" }]);
    render(<MonthlyClosingPage />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Sem ciclo em aberto: o último fechamento vai até 30/11/2026")).toBeTruthy();
    expectNoInvertedRange();
  });

  it("closed exactly through today is also 'no open cycle'", () => {
    setToday("2026-12-10");
    setData([charge("a", "A", "2026-12-01", "2026-12-10")], [{ id: "A", name: "Ana" }]);
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Sem ciclo em aberto: o último fechamento vai até 10/12/2026")).toBeTruthy();
    expect(calcButton().disabled).toBe(true);
  });
});

describe("the open cycle exists", () => {
  it("only some passengers closed through today: open cycle from the right start, no notice", () => {
    setToday("2026-12-10");
    setData(
      [charge("a", "A", "2026-12-01", "2026-12-10"), charge("b", "B", "2026-12-01", "2026-12-06")],
      [
        { id: "A", name: "Ana" },
        { id: "B", name: "Bia" },
      ],
      [ride("b-open", "B", "2026-12-08", 15)],
    );
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 07/12/2026 a hoje")).toBeTruthy();
    expect(screen.queryByText(/Sem ciclo em aberto/)).toBeNull();
    expect(mocks.rides).toHaveBeenLastCalledWith("2026-12-07", "2026-12-10", [], true);
    expect(calcButton().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a passenger with no charge still enters as 'extra' and the screen loads", () => {
    setToday("2026-12-10");
    setData(
      [charge("a", "A", "2026-12-01", "2026-12-12"), charge("b", "B", "2026-12-01", "2026-12-15")],
      [
        { id: "A", name: "Ana" },
        { id: "B", name: "Bia" },
        { id: "C", name: "Caio" },
      ],
      [ride("c1", "C", "2026-12-05", 20)],
    );
    render(<MonthlyClosingPage />);
    // Todos os fechados passam de hoje, mas o Caio nunca fechou: o ciclo em aberto existe.
    expect(mocks.rides).toHaveBeenLastCalledWith(null, "2026-12-10", ["C"], true);
    expect(mocks.received).toHaveBeenLastCalledWith(null, "2026-12-10", ["C"], true);
    expect(screen.getByText("Ciclo em aberto: 05/12/2026 a hoje")).toBeTruthy();
    expect(screen.getByText("Caio")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Sem ciclo em aberto/)).toBeNull();
    expect(calcButton().disabled).toBe(false);
    expectNoInvertedRange();
  });

  it("movement after the last closing brings the open cycle back and re-enables the button", () => {
    setToday("2026-12-10");
    const people = [{ id: "A", name: "Ana" }];
    setData([charge("a", "A", "2026-12-01", "2026-12-10")], people);
    const { rerender } = render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(true);
    expect(screen.queryByText(/Ciclo em aberto/)).toBeNull();

    // Entra um passageiro novo, com diária e sem cobrança.
    setData(
      [charge("a", "A", "2026-12-01", "2026-12-10")],
      [...people, { id: "B", name: "Bia" }],
      [ride("b1", "B", "2026-12-09", 12)],
    );
    rerender(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 09/12/2026 a hoje")).toBeTruthy();
    expect(screen.queryByText(/Sem ciclo em aberto/)).toBeNull();
    expect(calcButton().disabled).toBe(false);
  });

  it("the next day the last closing is behind today: the open cycle exists again", () => {
    setToday("2026-12-10");
    setData([charge("a", "A", "2026-12-01", "2026-12-10")], [{ id: "A", name: "Ana" }]);
    const { rerender } = render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(true);

    setToday("2026-12-11");
    setData([charge("a", "A", "2026-12-01", "2026-12-10")], [{ id: "A", name: "Ana" }], [ride("a1", "A", "2026-12-11", 10)]);
    rerender(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 11/12/2026 a hoje")).toBeTruthy();
    expect(calcButton().disabled).toBe(false);
  });
});

describe("load errors", () => {
  const people = [{ id: "A", name: "Ana" }];
  function failWith(which: "charges" | "rides", error: unknown) {
    setToday("2026-12-10");
    setData([charge("a", "A", "2026-12-01", "2026-12-06")], people);
    if (which === "charges") mocks.charges.mockReturnValue({ data: undefined, isError: true, error });
    else mocks.rides.mockReturnValue({ data: undefined, isError: true, error });
  }

  it("a network failure says there is no connection and names the query", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWith("rides", new LoadError("network"));
    render(<MonthlyClosingPage />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Sem conexão. Verifique a internet e tente de novo.");
    expect(alert.textContent).toContain("Consulta com falha: diárias.");
    expect(alert.textContent).not.toContain("inconsistentes");
  });

  it("a data failure says the data is inconsistent and names the query", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWith("charges", new LoadError("data"));
    render(<MonthlyClosingPage />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Os dados do ciclo estão inconsistentes. Tente de novo ou avise o suporte.");
    expect(alert.textContent).toContain("Consulta com falha: cobranças.");
    expect(alert.textContent).not.toContain("Sem conexão");
  });

  it("an unclassified error counts as a data error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWith("rides", new Error("Período inválido: o início vem depois do fim."));
    render(<MonthlyClosingPage />);
    expect(screen.getByRole("alert").textContent).toContain("inconsistentes");
  });

  it("logs the real error with console.error in development", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new LoadError("data");
    failWith("rides", error);
    render(<MonthlyClosingPage />);
    expect(spy).toHaveBeenCalledWith("[Cobranças: consulta de diárias]", error);
  });

  it("does not log outside development", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DEV", false);
    failWith("rides", new LoadError("data"));
    render(<MonthlyClosingPage />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
});
