import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionScope } from "@/lib/sessionScope";
import { useGenerateReceipt } from "@/hooks/useReceipt";
import type { MonthlyCharge, Passenger } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rides: vi.fn(),
  received: vi.fn(),
  pdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/services/rides.service", () => ({ listRidesByPeriod: mocks.rides }));
vi.mock("@/services/receivedRides.service", () => ({ listReceivedRidesByPeriod: mocks.received }));
vi.mock("@/services/pdf.service", () => ({ generateMonthlyReceipt: mocks.pdf }));
vi.mock("@/utils/downloadFile", () => ({ downloadFile: mocks.download }));

const passenger = { id: "P1", name: "Ana Souza", defaultDailyRate: 10, active: true, createdAt: "", updatedAt: "" } as Passenger;
const charge: MonthlyCharge = {
  id: "C1",
  passengerId: "P1",
  referenceMonth: "2026-11-01",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  revision: 3,
  activePaymentId: null,
  totalAmount: 126,
  paid: false,
  paidAmount: 90,
  paidAt: null,
  createdAt: "",
  extensible: true,
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  vi.clearAllMocks();
  const lease = createSessionScope("A");
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  mocks.auth.mockImplementation(() => ({ scope: lease.scope, user: { id: "A" }, loading: false }));
  mocks.rides.mockResolvedValue([]);
  mocks.received.mockResolvedValue([]);
  mocks.pdf.mockResolvedValue(new Uint8Array([1]));
});

describe("useGenerateReceipt with an open cycle", () => {
  it("refuses, before fetching anything or generating a file", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ passenger, charge })).rejects.toThrow(
        "Encerre o ciclo para gerar o comprovante.",
      );
    });
    expect(mocks.rides).not.toHaveBeenCalled();
    expect(mocks.received).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("a closed charge is generated as before", async () => {
    const { result } = renderHook(useGenerateReceipt, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ passenger, charge: { ...charge, extensible: false } });
    });
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});
