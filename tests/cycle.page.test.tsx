import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  events: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  passengers: vi.fn(),
  pay: vi.fn(),
}));
vi.mock("@/hooks/useMonthlyCharges", () => ({
  useCycleCharges: mocks.charges,
  usePaymentEventsForCharges: mocks.events,
  useMarkMonthlyChargePaid: () => ({ mutateAsync: mocks.pay }),
  useUnmarkMonthlyChargePaid: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/usePassengers", () => ({ usePassengers: mocks.passengers }));
vi.mock("@/hooks/useRides", () => ({ useRidesByPeriod: mocks.rides }));
vi.mock("@/hooks/useReceivedRides", () => ({ useReceivedRidesByPeriod: mocks.received }));
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: vi.fn() }) }));

// Hoje, em São Paulo: 10/12/2026.
const TODAY = "2026-12-10";

const passengers = [
  { id: "A", name: "Ana" },
  { id: "B", name: "Bia" },
  { id: "C", name: "Caio" },
];
const charge = (id: string, passengerId: string, periodStart: string, periodEnd: string, totalAmount: number, paidAmount: number, paid: boolean) => ({
  id,
  passengerId,
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  totalAmount,
  paid,
  paidAmount,
  revision: 1,
  activePaymentId: null,
});
// Dezembro: Ana desde 1/nov e Bia desde 5/nov, as duas até 6/dez. Outubro: Ana, 90 com 54 pagos.
const closedCharges = [
  charge("CA2", "A", "2026-11-01", "2026-12-06", 30, 30, true),
  charge("CB2", "B", "2026-11-05", "2026-12-06", 20, 0, false),
  charge("CA1", "A", "2026-10-01", "2026-10-31", 90, 54, false),
];
const ride = (id: string, passengerId: string, rideDate: string, rateCharged: number) => ({ id, passengerId, rideDate, rateCharged });
const baseRides = [
  ride("a-oct", "A", "2026-10-05", 90),
  ride("a-nov", "A", "2026-11-10", 30),
  ride("b-nov", "B", "2026-11-06", 20),
  // Em aberto: Ana depois de 6/dez; Caio nunca fechou (1ª data é a compensação de 4/dez).
  ride("a-open", "A", "2026-12-08", 10),
  ride("c-open", "C", "2026-12-05", 15),
];
const baseReceived = [{ id: "c-comp", passengerId: "C", receivedDate: "2026-12-04", amount: 5 }];

function setData({ charges = closedCharges, rides = baseRides, received = baseReceived, people = passengers } = {}) {
  mocks.charges.mockReturnValue({ data: charges });
  mocks.rides.mockReturnValue({ data: rides });
  mocks.received.mockReturnValue({ data: received });
  mocks.passengers.mockReturnValue({ data: people });
}
const previous = () => fireEvent.click(screen.getByLabelText("Ciclo anterior"));
const next = () => fireEvent.click(screen.getByLabelText("Próximo ciclo"));
const heading = () => screen.getByText(/Ciclo em aberto|^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  mocks.events.mockReturnValue({ data: [] });
  mocks.pay.mockResolvedValue({});
  setData();
});
afterEach(() => vi.useRealTimers());

describe("open cycle", () => {
  it("is the first screen, starts at the smallest start and says 'a hoje'", () => {
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 04/12/2026 a hoje")).toBeTruthy();
  });

  it("lists previews only: each passenger from their own start, never closed or not", () => {
    render(<MonthlyClosingPage />);
    expect(screen.getAllByText("Prévia")).toHaveLength(2);
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Caio")).toBeTruthy();
    expect(screen.queryByText("Bia")).toBeNull();
    // Ana começou depois do início do ciclo em aberto (7/dez contra 4/dez); Caio abre o ciclo.
    expect(screen.getByText("desde 07/12")).toBeTruthy();
    expect(screen.getAllByText(/desde/)).toHaveLength(1);
  });

  it("totals the passenger's own period: Caio is rides minus compensation", () => {
    render(<MonthlyClosingPage />);
    const caio = screen.getByText("Caio").closest(".surface") as HTMLElement;
    expect(caio.querySelector(".stat-value")?.textContent?.replace(/\s/g, " ")).toBe("R$ 10,00");
    expect(within(caio).getByText(/Diárias: R\$\s15,00 · Compensação: −R\$\s5,00/)).toBeTruthy();
  });

  it("offers no payment on a preview", () => {
    render(<MonthlyClosingPage />);
    expect(screen.queryByText("Marcar como pago")).toBeNull();
  });

  it("asks for movement from the day after each last end, plus the whole history of passengers who never closed", () => {
    render(<MonthlyClosingPage />);
    // Ana e Bia fecharam até 6/dez e Ana também em outubro; Caio nunca fechou.
    expect(mocks.rides).toHaveBeenLastCalledWith("2026-12-07", TODAY, ["C"], true);
    expect(mocks.received).toHaveBeenLastCalledWith("2026-12-07", TODAY, ["C"], true);
  });

  it("when nobody ever closed, asks only for the passengers' history", () => {
    setData({ charges: [] });
    render(<MonthlyClosingPage />);
    expect(mocks.rides).toHaveBeenLastCalledWith(null, TODAY, ["A", "B", "C"], true);
  });

  it("does not ask for anything until the charges and passengers are loaded", () => {
    mocks.charges.mockReturnValue({ data: undefined, isLoading: true });
    mocks.rides.mockReturnValue({ data: undefined });
    mocks.received.mockReturnValue({ data: undefined });
    render(<MonthlyClosingPage />);
    expect(mocks.rides).toHaveBeenLastCalledWith(null, TODAY, [], false);
  });
});

describe("empty states", () => {
  it("nobody has movement after the last closing", () => {
    setData({ rides: [ride("a-oct", "A", "2026-10-05", 90), ride("a-nov", "A", "2026-11-10", 30), ride("b-nov", "B", "2026-11-06", 20)], received: [], people: passengers.slice(0, 2) });
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto")).toBeTruthy();
    expect(screen.getByText("Nenhuma diária ou compensação em aberto desde o último fechamento.")).toBeTruthy();
    expect(screen.queryByText("Prévia")).toBeNull();
    // O saldo dos ciclos fechados continua visível mesmo com o ciclo em aberto vazio.
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s56,00/)).toBeTruthy();
  });

  it("nothing registered at all", () => {
    setData({ charges: [], rides: [], received: [] });
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Nenhuma diária registrada ainda.")).toBeTruthy();
    expect((screen.getByLabelText("Ciclo anterior") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Próximo ciclo") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("arrows walk the cycle list", () => {
  it("goes from the open cycle to the oldest and back", () => {
    render(<MonthlyClosingPage />);
    expect(heading()).toBe("Ciclo em aberto: 04/12/2026 a hoje");
    expect((screen.getByLabelText("Próximo ciclo") as HTMLButtonElement).disabled).toBe(true);

    previous();
    expect(heading()).toBe("01/11/2026 a 06/12/2026");
    previous();
    expect(heading()).toBe("01/10/2026 a 31/10/2026");
    expect((screen.getByLabelText("Ciclo anterior") as HTMLButtonElement).disabled).toBe(true);

    next();
    expect(heading()).toBe("01/11/2026 a 06/12/2026");
    next();
    expect(heading()).toBe("Ciclo em aberto: 04/12/2026 a hoje");
  });

  it("asks for the range of the selected closed cycle: smallest start to the end", () => {
    render(<MonthlyClosingPage />);
    previous();
    expect(mocks.rides).toHaveBeenLastCalledWith("2026-11-01", "2026-12-06", [], true);
    expect(mocks.received).toHaveBeenLastCalledWith("2026-11-01", "2026-12-06", [], true);
    previous();
    expect(mocks.rides).toHaveBeenLastCalledWith("2026-10-01", "2026-10-31", [], true);
  });

  it("only the selected cycle's passengers are listed", () => {
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Bia")).toBeTruthy();
    expect(screen.queryByText("Caio")).toBeNull();
    previous();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Bia")).toBeNull();
  });
});

describe("a closed cycle that crosses months", () => {
  it("is titled with the smallest start and flags who began later", () => {
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.getByText("01/11/2026 a 06/12/2026")).toBeTruthy();
    expect(screen.getByText(/A receber · 01\/11\/2026 a 06\/12\/2026/)).toBeTruthy();
    expect(screen.getAllByText(/desde/)).toHaveLength(1);
    const bia = screen.getByText("Bia").closest(".surface") as HTMLElement;
    expect(within(bia).getByText("desde 05/11")).toBeTruthy();
    const ana = screen.getByText("Ana").closest(".surface") as HTMLElement;
    expect(within(ana).queryByText(/desde/)).toBeNull();
  });

  it("a ride after the end of the cycle but in the same calendar month does not outdate it", () => {
    render(<MonthlyClosingPage />);
    previous();
    // A diária de Ana em 8/dez está no ciclo em aberto; o ciclo até 6/dez continua batendo.
    expect(screen.queryByText("Desatualizado")).toBeNull();
    expect(screen.getByText("Pago")).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
  });

  it("opens the sheet labelled with the passenger's own period", () => {
    render(<MonthlyClosingPage />);
    previous();
    fireEvent.click(screen.getByText("Bia"));
    expect(screen.getByText(/Cobrança · 05\/11\/2026 a 06\/12\/2026/)).toBeTruthy();
    expect(screen.getByText("Total do período")).toBeTruthy();
  });

  it("paying still sends the charge id and its revision", () => {
    render(<MonthlyClosingPage />);
    previous();
    fireEvent.click(screen.getByText("Marcar como pago"));
    expect(mocks.pay).toHaveBeenCalledWith({ id: "CB2", revision: 1 });
  });
});

describe("'Desatualizado' is judged by each charge's own period", () => {
  it("flags the cycle whose stored total no longer matches its rides", () => {
    setData({ rides: baseRides.map((r) => (r.id === "a-oct" ? { ...r, rateCharged: 80 } : r)) });
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.queryByText("Desatualizado")).toBeNull();
    previous();
    expect(screen.getByText("Desatualizado")).toBeTruthy();
    expect(screen.getByText(/Total atualizado seria R\$\s80,00/)).toBeTruthy();
  });

  it("compares in exact cents", () => {
    setData({
      charges: [charge("C1", "A", "2026-11-01", "2026-12-06", 0.3, 0, false)],
      rides: [ride("1", "A", "2026-11-02", 0.1), ride("2", "A", "2026-12-06", 0.2)],
      received: [],
      people: passengers.slice(0, 1),
    });
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.queryByText("Desatualizado")).toBeNull();
  });

  it("a ride on the first or last day counts, one day outside does not", () => {
    setData({
      charges: [charge("C1", "A", "2026-11-01", "2026-12-06", 20, 0, false)],
      rides: [ride("1", "A", "2026-11-01", 10), ride("2", "A", "2026-12-06", 10), ride("3", "A", "2026-10-31", 10), ride("4", "A", "2026-12-07", 10)],
      received: [],
      people: passengers.slice(0, 1),
    });
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.queryByText("Desatualizado")).toBeNull();
  });
});

describe("'Em aberto em outros ciclos'", () => {
  it("shows the other cycles' balance and follows the selection", () => {
    render(<MonthlyClosingPage />);
    // Aberto: ficam os 36 de outubro e os 20 da Bia.
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s56,00/)).toBeTruthy();
    previous();
    // Até 6/dez: sobram os 36 de outubro (a Bia, 20, está neste ciclo).
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s36,00/)).toBeTruthy();
    previous();
    // Outubro: só os 20 da Bia no ciclo de dezembro.
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s20,00/)).toBeTruthy();
  });

  it("disappears when nothing is open elsewhere", () => {
    setData({ charges: closedCharges.map((c) => ({ ...c, paid: true, paidAmount: c.totalAmount })) });
    render(<MonthlyClosingPage />);
    previous();
    expect(screen.queryByText(/Em aberto em outros ciclos/)).toBeNull();
  });
});

describe("the calculate button waits for the next stage", () => {
  it("is visible, disabled and explains why", () => {
    render(<MonthlyClosingPage />);
    const button = screen.getByRole("button", { name: "Calcular fechamento" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("O fechamento por data chega na próxima etapa")).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.pay).not.toHaveBeenCalled();
  });
});
