import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";
const mocks = vi.hoisted(() => ({ pay: vi.fn(), cancel: vi.fn(), charges: vi.fn(), events: vi.fn() }));
vi.mock("@/hooks/useMonthlyCharges", () => ({ useCycleCharges: mocks.charges, usePaymentEventsForCharges: mocks.events, useMarkMonthlyChargePaid: () => ({ mutateAsync: mocks.pay }), useUnmarkMonthlyChargePaid: () => ({ mutateAsync: mocks.cancel }) }));
vi.mock("@/hooks/usePassengers", () => ({ usePassengers: () => ({ data: [{ id: "P", name: "Pessoa" }] }) }));
vi.mock("@/hooks/useRides", () => ({ useRidesByPeriod: () => ({ data: [{ passengerId: "P", rideDate: "2026-10-05", rateCharged: 0.1 }, { passengerId: "P", rideDate: "2026-10-06", rateCharged: 0.2 }] }) }));
vi.mock("@/hooks/useReceivedRides", () => ({ useReceivedRidesByPeriod: () => ({ data: [] }) }));
vi.mock("@/hooks/useReceipt", () => ({ useGenerateReceipt: () => ({ mutateAsync: vi.fn() }) }));
const payment = (id: string, revision: number, signedAmount: number) => ({ id, monthlyChargeId: "C", kind: "PAYMENT" as const, revision, signedAmount, relatedPaymentId: null });
const charge = { id: "C", passengerId: "P", periodStart: "2026-10-01", periodEnd: "2026-10-31", totalAmount: 0.3, paid: false, paidAmount: 0, revision: 7, activePaymentId: null };
// A página abre no ciclo em aberto; as cobranças fechadas ficam um passo atrás na lista de ciclos.
const renderClosedCycle = () => { render(<MonthlyClosingPage />); fireEvent.click(screen.getByLabelText("Ciclo anterior")); };
beforeEach(() => { vi.clearAllMocks(); mocks.charges.mockReturnValue({ data: [charge] }); mocks.events.mockReturnValue({ data: [] }); mocks.pay.mockResolvedValue({}); mocks.cancel.mockResolvedValue({}); });
describe("closing page RPC anchors", () => {
  it("exact cent preview matches charge and payment sends revision", async () => { renderClosedCycle(); expect(screen.queryByText("Desatualizado")).toBeNull(); fireEvent.click(screen.getByText("Marcar como pago")); await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith({ id: "C", revision: 7 })); });
  it("desmarcar sends exact active payment id", async () => { mocks.charges.mockReturnValue({ data: [{ ...charge, paid: true, paidAmount: 0.3, activePaymentId: "payment-7" }] }); mocks.events.mockReturnValue({ data: [payment("payment-7", 7, 0.3)] }); renderClosedCycle(); fireEvent.click(screen.getByText("Pessoa")); fireEvent.click(await screen.findByText("Desmarcar pagamento")); await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ id: "C", paymentId: "payment-7" })); });
  it("after a recalculation, desmarcar sends the latest live payment and skips the one zeroed by the old reopen", async () => { mocks.charges.mockReturnValue({ data: [{ ...charge, paid: true, paidAmount: 0.5, activePaymentId: null }] }); mocks.events.mockReturnValue({ data: [payment("old", 1, 0.3), payment("first", 3, 0.2), payment("second", 4, 0.3)] }); renderClosedCycle(); fireEvent.click(screen.getByText("Pessoa")); fireEvent.click(await screen.findByText("Desmarcar pagamento")); await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ id: "C", paymentId: "second" })); });
  it("hides desmarcar when no payment can be undone", async () => { mocks.charges.mockReturnValue({ data: [{ ...charge, paid: true, paidAmount: 0.3, activePaymentId: null }] }); renderClosedCycle(); expect(screen.getByText("Pago")).toBeTruthy(); fireEvent.click(screen.getByText("Pessoa")); expect(await screen.findByText("Gerar comprovante")).toBeTruthy(); expect(screen.queryByText("Desmarcar pagamento")).toBeNull(); });
  it("presents sanitized service errors", async () => { mocks.pay.mockRejectedValue(new Error("A cobrança mudou. Atualize os dados e repita a operação.")); renderClosedCycle(); fireEvent.click(screen.getByText("Marcar como pago")); expect(await screen.findByText(/A cobrança mudou/)).toBeTruthy(); });
});
