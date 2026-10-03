import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMonthlyCharges } from "@/services/monthlyCharges.service";
import { createSessionScope } from "@/lib/sessionScope";
const mocks = vi.hoisted(() => ({ rides: vi.fn(), received: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => "A",
  supabase: { from: mocks.from },
}));
vi.mock("@/services/rides.service", () => ({ listRidesByMonth: mocks.rides }));
vi.mock("@/services/receivedRides.service", () => ({
  listReceivedRidesByMonth: mocks.received,
}));
beforeEach(() => {
  mocks.rides.mockReset();
  mocks.received.mockReset().mockResolvedValue([]);
  mocks.from.mockReset();
});
describe("multi-request service session guard", () => {
  it("does not start the closing write after the session changes during reads", async () => {
    let complete!: (data: unknown[]) => void;
    const reads = new Promise<unknown[]>((resolve) => {
      complete = resolve;
    });
    mocks.rides.mockReturnValue(reads);
    const lease = createSessionScope("A");
    const operation = calculateMonthlyCharges("2025-01-01", lease.scope);
    await Promise.resolve();
    lease.dispose();
    complete([{ passengerId: "P", rateCharged: 10 }]);
    await expect(operation).rejects.toThrow("sessão mudou");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
