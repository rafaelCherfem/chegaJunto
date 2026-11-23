import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createSessionScope } from "@/lib/sessionScope";
import { useCloseCycle, usePreviewCycle } from "@/hooks/useMonthlyCharges";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), preview: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/services/monthlyCharges.service", () => ({
  previewCycle: mocks.preview,
  closeCycle: mocks.close,
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  const lease = createSessionScope("A");
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mocks.auth.mockImplementation(() => ({ scope: lease.scope, user: { id: "A" }, loading: false }));
  mocks.preview.mockResolvedValue([]);
  mocks.close.mockResolvedValue([]);
});

describe("cycle hooks", () => {
  it("closing sends the date and invalidates the charges", async () => {
    const { result } = renderHook(() => useCloseCycle(), { wrapper });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current.mutateAsync("2026-12-09");
    });
    expect(mocks.close.mock.calls[0]?.[0]).toBe("2026-12-09");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["private", "A", "monthlyCharges"] });
  });

  it("previewing sends the date and invalidates nothing", async () => {
    const { result } = renderHook(() => usePreviewCycle(), { wrapper });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current.mutateAsync("2026-12-09");
    });
    expect(mocks.preview.mock.calls[0]?.[0]).toBe("2026-12-09");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
