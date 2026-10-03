import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createSessionScope } from "@/lib/sessionScope";
import { useCalculateMonthlyCharges, useMarkMonthlyChargePaid, useUnmarkMonthlyChargePaid } from "@/hooks/useMonthlyCharges";
import { useDeleteRide } from "@/hooks/useRides";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), pay: vi.fn(), cancel: vi.fn(), close: vi.fn(), remove: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/services/monthlyCharges.service", () => ({ markMonthlyChargePaid: mocks.pay, unmarkMonthlyChargePaid: mocks.cancel, calculateMonthlyCharges: mocks.close }));
vi.mock("@/services/rides.service", () => ({ deleteRide: mocks.remove }));
let lease: ReturnType<typeof createSessionScope>, client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); lease = createSessionScope("A"); client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  mocks.auth.mockImplementation(() => ({ scope: lease.scope, user: { id: lease.scope.userId }, loading: false }));
});
describe("financial private mutations", () => {
  it.each(["pay", "cancel", "close"])("late %s A response cannot invalidate B", async (action) => {
    let finish!: (v: unknown) => void; const deferred = new Promise(resolve => { finish = resolve; });
    mocks.pay.mockReturnValue(deferred); mocks.cancel.mockReturnValue(deferred); mocks.close.mockReturnValue(deferred);
    const original = lease.scope;
    const { result, rerender } = renderHook(() => ({ pay: useMarkMonthlyChargePaid(), cancel: useUnmarkMonthlyChargePaid(), close: useCalculateMonthlyCharges() }), { wrapper });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    let outcome!: Promise<unknown>;
    act(() => { outcome = (action === "pay" ? result.current.pay.mutateAsync({ id: "C", revision: 1 }) : action === "cancel" ? result.current.cancel.mutateAsync({ id: "C", paymentId: "payment" }) : result.current.close.mutateAsync("2025-01-01")).catch(error => error); });
    await waitFor(() => expect(action === "pay" ? mocks.pay : action === "cancel" ? mocks.cancel : mocks.close).toHaveBeenCalled());
    expect((action === "pay" ? mocks.pay : action === "cancel" ? mocks.cancel : mocks.close).mock.calls[0]?.at(-1)).toBe(original);
    lease.dispose(); lease = createSessionScope("B"); rerender(); client.setQueryData(["private", "B", "monthlyCharges"], ["B-only"]);
    await act(async () => { finish({ owner: "A" }); expect(await outcome).toBeInstanceOf(Error); });
    expect(invalidate).not.toHaveBeenCalled(); expect(client.getQueryData(["private", "B", "monthlyCharges"])).toEqual(["B-only"]);
    client.clear();
  });
  it.each(["pay", "cancel", "close"])("successful %s invalidates only captured A financial cache", async (action) => {
    mocks.pay.mockResolvedValue({}); mocks.cancel.mockResolvedValue({}); mocks.close.mockResolvedValue([]);
    const { result } = renderHook(() => ({ pay: useMarkMonthlyChargePaid(), cancel: useUnmarkMonthlyChargePaid(), close: useCalculateMonthlyCharges() }), { wrapper });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => { if (action === "pay") await result.current.pay.mutateAsync({ id: "C", revision: 1 }); else if (action === "cancel") await result.current.cancel.mutateAsync({ id: "C", paymentId: "payment" }); else await result.current.close.mutateAsync("2025-01-01"); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["private", "A", "monthlyCharges"] }); client.clear();
  });
  it("ledger deletion also invalidates the reconciled charge cache", async () => {
    mocks.remove.mockResolvedValue(undefined);
    const { result } = renderHook(useDeleteRide, { wrapper }); const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => { await result.current.mutateAsync("ride"); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["private", "A", "rides"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["private", "A", "monthlyCharges"] }); client.clear();
  });
});
