import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionScope } from "@/lib/sessionScope";
import { calculateMonthlyCharges, markMonthlyChargePaid, registerPayment } from "@/services/monthlyCharges.service";
import { formatCurrency } from "@/utils/currency";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rpcResult: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const chargeRow = {
  revision: 4,
  active_payment_id: null,
  recalculated_at: "",
  id: "C1",
  user_id: "U",
  passenger_id: "P1",
  reference_month: "2026-11-01",
  period_start: "2026-11-01",
  period_end: "2026-11-30",
  total_amount: 270,
  paid: false,
  paid_amount: 100,
  paid_at: "2026-11-20T12:00:00Z",
  created_at: "",
  extensible: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReturnValue({
    abortSignal: (signal: AbortSignal) => {
      const promise = mocks.rpcResult(signal);
      return Object.assign(promise, { single: () => promise });
    },
  });
  mocks.rpcResult.mockResolvedValue({ data: chargeRow, error: null });
});

describe("registerPayment", () => {
  it("calls register_payment with the charge, the amount and the confirmed revision", async () => {
    const charge = await registerPayment("C1", 100, 3);
    expect(mocks.rpc).toHaveBeenCalledWith("register_payment", {
      target_charge: "C1",
      payment_amount: 100,
      expected_revision: 3,
    });
    expect(charge).toMatchObject({ id: "C1", paidAmount: 100, revision: 4, extensible: true });
  });

  it("passes cents exactly as a number", async () => {
    await registerPayment("C1", 12.34, 1);
    expect(mocks.rpc.mock.calls[0]![1].payment_amount).toBe(12.34);
  });

  it("a database without migration 0015 says the free payment is not available yet", async () => {
    mocks.rpcResult.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.register_payment(expected_revision, payment_amount, target_charge) in the schema cache" },
    });
    await expect(registerPayment("C1", 10, 1)).rejects.toThrow(
      "Pagamento livre ainda não está disponível. Tente de novo em instantes.",
    );
  });

  it("a stale revision asks the user to refresh", async () => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "40001", message: "STALE_OBLIGATION" } });
    await expect(registerPayment("C1", 10, 1)).rejects.toThrow("cobrança mudou");
  });

  it.each([
    ["INVALID_PAYMENT_AMOUNT", "Informe um valor maior que zero, com no máximo duas casas decimais."],
    ["NO_OBLIGATION", "Não há nada a receber desta cobrança."],
    ["PAYMENT_EXCEEDS_OUTSTANDING", "O valor é maior que o que falta receber."],
  ])("%s without a hint uses the fixed text", async (token, text) => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "23514", message: token } });
    await expect(registerPayment("C1", 10, 1)).rejects.toThrow(text);
  });

  it("shows the hint with the outstanding amount in reais", async () => {
    mocks.rpcResult.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "PAYMENT_EXCEEDS_OUTSTANDING",
        hint: "O valor é maior que o que falta receber. Falta receber 180.00.",
      },
    });
    await expect(registerPayment("C1", 500, 1)).rejects.toThrow(`Falta receber ${formatCurrency(180)}.`);
  });

  it("NO_OBLIGATION uses the database hint here (pay_charge keeps its own text)", async () => {
    mocks.rpcResult.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "NO_OBLIGATION", hint: "Não há nada a receber desta cobrança." },
    });
    await expect(registerPayment("C1", 10, 1)).rejects.toThrow("Não há nada a receber");
    await expect(markMonthlyChargePaid("C1", 1)).rejects.toThrow("Nenhum valor pendente");
  });

  it("an unknown database error never leaks", async () => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret internals" } });
    await expect(registerPayment("C1", 10, 1)).rejects.not.toThrow("secret");
  });

  it("a late response from a previous session is not returned", async () => {
    const lease = createSessionScope("A");
    let finish!: (value: unknown) => void;
    mocks.rpcResult.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = registerPayment("C1", 10, 1, lease.scope);
    lease.dispose();
    finish({ data: chargeRow, error: null });
    await expect(pending).rejects.toThrow("sessão mudou");
  });
});

describe("EXTENSIBLE_CYCLE_OPEN on the old monthly closing", () => {
  it("shows the database text in Portuguese", async () => {
    mocks.rpcResult.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "EXTENSIBLE_CYCLE_OPEN",
        hint: "Existe um ciclo em aberto. Encerre o ciclo pela tela de cobranças antes de fechar um mês.",
      },
    });
    await expect(calculateMonthlyCharges("2026-11-01")).rejects.toThrow("Existe um ciclo em aberto");
  });
});
