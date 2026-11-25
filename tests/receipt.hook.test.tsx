import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createSessionScope } from "@/lib/sessionScope";
import { useGenerateReceipt } from "@/hooks/useReceipt";
import type { MonthlyCharge, Passenger } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  byMonth: vi.fn(),
  events: vi.fn(),
  pdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/services/rides.service", () => ({
  listRidesByPeriod: mocks.rides,
  listRidesByMonth: mocks.byMonth,
}));
vi.mock("@/services/receivedRides.service", () => ({
  listReceivedRidesByPeriod: mocks.received,
  listReceivedRidesByMonth: mocks.byMonth,
}));
vi.mock("@/services/monthlyCharges.service", () => ({ listPaymentEventsForCharges: mocks.events }));
vi.mock("@/services/pdf.service", () => ({ generateMonthlyReceipt: mocks.pdf }));
vi.mock("@/utils/downloadFile", () => ({ downloadFile: mocks.download }));

const passenger: Passenger = {
  id: "P1",
  name: "  Ana Beatriz Souza ",
  defaultDailyRate: 10,
  active: true,
  createdAt: "",
  updatedAt: "",
};
const charge: MonthlyCharge = {
  id: "C1",
  passengerId: "P1",
  referenceMonth: "2026-11-01",
  periodStart: "2026-11-01",
  periodEnd: "2026-12-06",
  revision: 3,
  activePaymentId: null,
  totalAmount: 126,
  paid: false,
  paidAmount: 90,
  paidAt: null,
  createdAt: "", extensible: false,
};

let lease: ReturnType<typeof createSessionScope>;
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  lease = createSessionScope("A");
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  mocks.auth.mockImplementation(() => ({ scope: lease.scope, user: { id: "A" }, loading: false }));
  mocks.rides.mockResolvedValue([{ id: "r1" }]);
  mocks.received.mockResolvedValue([{ id: "x1" }]);
  mocks.events.mockResolvedValue([]);
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

describe("useGenerateReceipt", () => {
  it("fetches the rides and compensations of the charge period, not of the calendar month", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ passenger, charge });
    });
    expect(mocks.rides).toHaveBeenCalledWith("2026-11-01", "2026-12-06", "P1", expect.anything());
    expect(mocks.received).toHaveBeenCalledWith("2026-11-01", "2026-12-06", "P1", expect.anything());
    expect(mocks.byMonth).not.toHaveBeenCalled();
  });

  it("hands the period to the PDF so the title shows the real dates", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ passenger, charge });
    });
    expect(mocks.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        charge,
        rides: [{ id: "r1" }],
        receivedRides: [{ id: "x1" }],
        periodStart: "2026-11-01",
        periodEnd: "2026-12-06",
      }),
    );
  });

  it("fetches the payment events of the charge itself and hands them to the PDF", async () => {
    const events = [{ id: "e1", monthlyChargeId: "C1", kind: "PAYMENT", revision: 1, signedAmount: 90, relatedPaymentId: null, occurredAt: "2026-11-20T15:00:00Z" }];
    mocks.events.mockResolvedValue(events);
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ passenger, charge });
    });
    expect(mocks.events).toHaveBeenCalledTimes(1);
    expect(mocks.events).toHaveBeenCalledWith(["C1"], expect.anything());
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ paymentEvents: events }));
  });

  it("does not generate a file when the payments cannot be loaded", async () => {
    mocks.events.mockRejectedValue(new Error("Não foi possível concluir a operação"));
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ passenger, charge })).rejects.toThrow("Não foi possível concluir a operação");
    });
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("names the file with the passenger and both dates", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ passenger, charge });
    });
    expect(mocks.download).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "comprovante-ana-beatriz-souza-2026-11-01_a_2026-12-06.pdf",
      "application/pdf",
    );
  });

  it("a monthly charge still produces a file with the first and last day of the month", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        passenger,
        charge: { ...charge, referenceMonth: "2026-10-01", periodStart: "2026-10-01", periodEnd: "2026-10-31" },
      });
    });
    expect(mocks.download.mock.calls[0]?.[1]).toBe("comprovante-ana-beatriz-souza-2026-10-01_a_2026-10-31.pdf");
  });
});
