import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMonthlyCharges, markMonthlyChargePaid, unmarkMonthlyChargePaid } from "@/services/monthlyCharges.service";
import { createSessionScope } from "@/lib/sessionScope";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
const row = { id: "C", user_id: "A", passenger_id: "P", reference_month: "2025-01-01", total_amount: -10.05, paid_amount: -10.05, paid: true, paid_at: "time", revision: 3, active_payment_id: "payment", created_at: "time" };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => { const promise = mocks.abort(signal); return Object.assign(promise, { single: () => promise }); } }); mocks.abort.mockResolvedValue({ data: row, error: null }); });
describe("financial RPC authority", () => {
  it("closing sends competence only", async () => {
    mocks.abort.mockResolvedValue({ data: [row], error: null });
    expect((await calculateMonthlyCharges("2025-01-01"))[0]?.totalAmount).toBe(-10.05);
    expect(mocks.rpc).toHaveBeenCalledWith("close_month", { month_date: "2025-01-01" });
  });
  it("payment sends version, never amount owner or time", async () => {
    const result = await markMonthlyChargePaid("C", 3);
    expect(mocks.rpc).toHaveBeenCalledWith("pay_charge", { target_charge: "C", expected_revision: 3 });
    expect(result.activePaymentId).toBe("payment");
    expect(result.paidAmount).toBe(-10.05);
  });
  it("cancel anchors the exact settlement", async () => {
    await unmarkMonthlyChargePaid("C", "payment");
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_charge_payment", { target_charge: "C", target_payment: "payment" });
  });
  it.each([calculateMonthlyCharges, (month: string) => markMonthlyChargePaid(month, 3), (month: string) => unmarkMonthlyChargePaid(month, "payment")])("sanitizes RPC details", async (operation) => {
    mocks.abort.mockResolvedValue({ data: null, error: { code: "42501", message: "private database internal secret" } });
    await expect(operation("2025-01-01")).rejects.not.toThrow("secret");
  });
  it("stale version has actionable sanitized error", async () => {
    mocks.abort.mockResolvedValue({ error: { code: "40001", message: "STALE_OBLIGATION" } });
    await expect(markMonthlyChargePaid("C", 1)).rejects.toThrow("cobrança mudou");
  });
  it("zero has a clear error", async () => {
    mocks.abort.mockResolvedValue({ error: { code: "23514", message: "NO_OBLIGATION" } });
    await expect(markMonthlyChargePaid("C", 1)).rejects.toThrow("Nenhum valor pendente");
  });
  it.each(["close", "pay", "cancel"])("late %s response from A cannot be returned to B", async (action) => {
    const lease = createSessionScope("A");
    let finish!: (v: unknown) => void;
    mocks.abort.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const operation = action === "close" ? calculateMonthlyCharges("2025-01-01", lease.scope) : action === "pay" ? markMonthlyChargePaid("C", 3, lease.scope) : unmarkMonthlyChargePaid("C", "payment", lease.scope);
    lease.dispose(); finish({ data: action === "close" ? [row] : row, error: null });
    await expect(operation).rejects.toThrow("sessão mudou");
    expect(mocks.abort).toHaveBeenCalledWith(lease.scope.signal);
  });
});
