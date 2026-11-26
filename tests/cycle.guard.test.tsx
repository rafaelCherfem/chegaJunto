import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  passengers: vi.fn(),
  preview: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/hooks/useMonthlyCharges", () => ({
  useCycleCharges: mocks.charges,
  usePaymentEventsForCharges: () => ({ data: [] }),
  useMarkMonthlyChargePaid: () => ({ mutateAsync: vi.fn() }),
  useUnmarkMonthlyChargePaid: () => ({ mutateAsync: vi.fn() }),
  usePreviewCycle: () => ({ mutateAsync: mocks.preview }),
  useCloseCycle: () => ({ mutateAsync: mocks.close }),
}));
vi.mock("@/hooks/usePassengers", () => ({ usePassengers: mocks.passengers }));
vi.mock("@/hooks/useRides", () => ({ useRidesByPeriod: mocks.rides }));
vi.mock("@/hooks/useReceivedRides", () => ({ useReceivedRidesByPeriod: mocks.received }));
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: vi.fn() }) }));

const GUARD_TEXT = "O encerramento por data está sendo ajustado e volta em breve.";
const NOTICE = (date: string) => `Último período: até ${date}. As novas diárias entram em um período novo.`;

const people = [{ id: "A", name: "Ana" }];
const charge = (id: string, periodStart: string, periodEnd: string) => ({
  id,
  passengerId: "A",
  referenceMonth: periodStart,
  periodStart,
  periodEnd,
  totalAmount: 100,
  paid: false,
  paidAmount: 0,
  revision: 1,
  activePaymentId: null,
});
const ride = (id: string, rideDate: string) => ({ id, passengerId: "A", rideDate, rateCharged: 10 });

function setData(charges: unknown[] | undefined, rides: unknown[] = []) {
  mocks.charges.mockReturnValue({ data: charges });
  mocks.rides.mockReturnValue({ data: rides });
  mocks.received.mockReturnValue({ data: [] });
  mocks.passengers.mockReturnValue({ data: people });
}
function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
}
const calcButton = () => screen.getByRole("button", { name: "Calcular fechamento" }) as HTMLButtonElement;
function expectNothingClosed() {
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  mocks.preview.mockResolvedValue([]);
  mocks.close.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("a whole-month last charge no longer blocks the closing (the deploy order protects)", () => {
  it("movement after the conversion month exists: the button is on and there is no explanation of a block", async () => {
    setToday("2026-12-02");
    setData([charge("nov", "2026-11-01", "2026-11-30")], [ride("r1", "2026-12-01")]);
    render(<MonthlyClosingPage />);
    expect(screen.getByText("Ciclo em aberto: 01/12/2026 a hoje")).toBeTruthy();
    expect(calcButton().disabled).toBe(false);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
    fireEvent.click(calcButton());
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("with no open cycle (November before it ends) the button is off only because everyone is closed, and the text says so", () => {
    setToday("2026-11-23");
    setData([charge("nov", "2026-11-01", "2026-11-30")]);
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(true);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
    expect(screen.getByText(/Todos os passageiros já estão fechados até 30\/11\/2026/)).toBeTruthy();
    fireEvent.click(calcButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expectNothingClosed();
  });

  it("an open sheet closes by itself when the charges stop being available", async () => {
    setToday("2026-12-10");
    setData([charge("a", "2026-12-01", "2026-12-06")], [ride("r1", "2026-12-08")]);
    const { rerender } = render(<MonthlyClosingPage />);
    fireEvent.click(calcButton());
    expect(await screen.findByRole("dialog")).toBeTruthy();

    setData(undefined, [ride("r1", "2026-12-08")]);
    rerender(<MonthlyClosingPage />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("stays blocked, with no explanation, while the charges are not loaded", () => {
    setToday("2026-12-10");
    setData(undefined);
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(true);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
    fireEvent.click(calcButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expectNothingClosed();
  });
});

describe("the closing is available in the other formats too", () => {
  it("last charge in another format (07/12 to 06/01)", async () => {
    setToday("2027-01-08");
    setData([charge("a", "2026-12-07", "2027-01-06")], [ride("r1", "2027-01-07")]);
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(false);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
    fireEvent.click(calcButton());
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("only the last charge counts: a whole October before a different November", () => {
    setToday("2026-11-28");
    setData(
      [charge("oct", "2026-10-01", "2026-10-31"), charge("nov", "2026-11-01", "2026-11-25")],
      [ride("r1", "2026-11-27")],
    );
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(false);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
  });

  it("nobody has closed yet", () => {
    setToday("2026-11-23");
    setData([], [ride("r1", "2026-11-20")]);
    render(<MonthlyClosingPage />);
    expect(calcButton().disabled).toBe(false);
    expect(screen.queryByText(GUARD_TEXT)).toBeNull();
  });
});

describe("the notice about the last period", () => {
  it("says the last period ends on the largest end, in dd/mm/aaaa, and does not sound like a scheduled closing", () => {
    setToday("2026-11-23");
    setData([charge("nov", "2026-11-01", "2026-11-30")]);
    render(<MonthlyClosingPage />);
    expect(screen.getByText(NOTICE("30/11/2026"))).toBeTruthy();
    expect(screen.queryByText(/Sem ciclo em aberto/)).toBeNull();
    expect(screen.queryByText(/último fechamento/)).toBeNull();
    // Sem a proteção de mês inteiro, a explicação de "fechados até" passa a aparecer junto do aviso.
    expect(screen.getByText(/Todos os passageiros já estão fechados até 30\/11\/2026/)).toBeTruthy();
  });

  it("does not appear when there is an open cycle", () => {
    setToday("2026-12-02");
    setData([charge("nov", "2026-11-01", "2026-11-30")], [ride("r1", "2026-12-01")]);
    render(<MonthlyClosingPage />);
    expect(screen.queryByText(/Último período/)).toBeNull();
  });
});
