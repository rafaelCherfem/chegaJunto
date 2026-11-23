import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionScope } from "@/lib/sessionScope";
import {
  closeCycle,
  listCycleCharges,
  listPaymentEventsForCharges,
  markMonthlyChargePaid,
  previewCycle,
  unmarkMonthlyChargePaid,
} from "@/services/monthlyCharges.service";
import { createRide, listRidesByPeriod } from "@/services/rides.service";
import { createReceivedRide, listReceivedRidesByPeriod } from "@/services/receivedRides.service";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcResult: vi.fn(),
  from: vi.fn(),
  result: vi.fn(),
  getUser: vi.fn(),
  passenger: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getUser,
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("@/services/passengers.service", () => ({ getPassenger: mocks.passenger }));

// Construtor de consultas: todo método devolve ele mesmo e o await devolve mocks.result().
const builder: Record<string, ReturnType<typeof vi.fn> | unknown> = {};
for (const method of ["select", "order", "gte", "lte", "in", "eq", "insert", "abortSignal", "single"]) {
  builder[method] = vi.fn(() => builder);
}
builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.result()).then(resolve);
const spy = (name: string) => builder[name] as ReturnType<typeof vi.fn>;

const dbRows = [
  { passenger_id: "P1", status: "CLOSED", reason: null, charge_id: "C1", period_start: "2026-11-01", period_end: "2026-12-06", total_amount: 126 },
  { passenger_id: "P2", status: "SKIPPED", reason: "ALREADY_CLOSED_UNTIL", charge_id: null, period_start: null, period_end: "2026-12-31", total_amount: null },
  { passenger_id: "P3", status: "NO_MOVEMENT", reason: null, charge_id: null, period_start: "2026-12-01", period_end: "2026-12-06", total_amount: null },
];
const entities = [
  { passengerId: "P1", status: "CLOSED", reason: null, chargeId: "C1", periodStart: "2026-11-01", periodEnd: "2026-12-06", totalAmount: 126 },
  { passengerId: "P2", status: "SKIPPED", reason: "ALREADY_CLOSED_UNTIL", chargeId: null, periodStart: null, periodEnd: "2026-12-31", totalAmount: null },
  { passengerId: "P3", status: "NO_MOVEMENT", reason: null, chargeId: null, periodStart: "2026-12-01", periodEnd: "2026-12-06", totalAmount: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-10T15:00:00Z"));
  mocks.rpc.mockReturnValue({
    abortSignal: (signal: AbortSignal) => {
      const promise = mocks.rpcResult(signal);
      return Object.assign(promise, { single: () => promise });
    },
  });
  mocks.rpcResult.mockResolvedValue({ data: dbRows, error: null });
  mocks.from.mockReturnValue(builder);
  mocks.result.mockReturnValue({ data: [], error: null });
  mocks.getUser.mockResolvedValue("owner");
  mocks.passenger.mockResolvedValue({ defaultDailyRate: 10 });
  spy("single").mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.useRealTimers());

describe.each([
  ["closeCycle", closeCycle, "close_cycle"],
  ["previewCycle", previewCycle, "preview_cycle"],
] as const)("%s", (_name, run, rpcName) => {
  it("sends only end_date and returns the summary rows mapped", async () => {
    expect(await run("2026-12-06")).toEqual(entities);
    expect(mocks.rpc).toHaveBeenCalledWith(rpcName, { end_date: "2026-12-06" });
  });

  it("returns an empty summary when there is nobody to close", async () => {
    mocks.rpcResult.mockResolvedValue({ data: [], error: null });
    expect(await run("2026-12-06")).toEqual([]);
  });

  it.each(["", "2026-12-6", "2026-02-30", "06/12/2026"])("rejects %j before calling the database", async (date) => {
    await expect(run(date)).rejects.toThrow("data válida");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_CYCLE_END", "23514", "Todos os passageiros já estão fechados até esta data.", "Todos os passageiros já estão fechados até esta data."],
    ["INVALID_CYCLE_END", "23514", undefined, "Escolha uma data de fim válida."],
    ["FUTURE_DATE", "23514", "A data de fim do ciclo não pode ser futura.", "A data de fim do ciclo não pode ser futura."],
    ["FUTURE_DATE", "23514", undefined, "A data de fim não pode ser futura."],
    ["FINANCIAL_FORBIDDEN", "42501", undefined, "Você não tem permissão para esta operação."],
  ])("maps %s (hint: %s) to Portuguese", async (token, code, hint, expected) => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code, message: token, hint } });
    await expect(run("2026-12-06")).rejects.toThrow(expected);
  });

  it("does not leak unknown database errors", async () => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "XX000", message: "private internal secret" } });
    await expect(run("2026-12-06")).rejects.toThrow("Não foi possível concluir a operação");
    await expect(run("2026-12-06")).rejects.not.toThrow("secret");
  });

  it("a late response from A cannot be returned to B", async () => {
    const lease = createSessionScope("A");
    let finish!: (value: unknown) => void;
    mocks.rpcResult.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const operation = run("2026-12-06", lease.scope);
    lease.dispose();
    finish({ data: dbRows, error: null });
    await expect(operation).rejects.toThrow("sessão mudou");
    expect(mocks.rpcResult).toHaveBeenCalledWith(lease.scope.signal);
  });
});

describe("financialError keeps the old mappings and gains the cycle tokens", () => {
  it("CYCLE_OVERLAP on a payment path is still Portuguese", async () => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "23514", message: "CYCLE_OVERLAP", hint: "Já existe um ciclo deste passageiro que cobre parte deste mês." } });
    await expect(markMonthlyChargePaid("C", 1)).rejects.toThrow("Já existe um ciclo");
  });
  it("stale version and NO_OBLIGATION keep their messages", async () => {
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "40001", message: "STALE_OBLIGATION" } });
    await expect(markMonthlyChargePaid("C", 1)).rejects.toThrow("cobrança mudou");
    mocks.rpcResult.mockResolvedValue({ data: null, error: { code: "23514", message: "NO_OBLIGATION" } });
    await expect(markMonthlyChargePaid("C", 1)).rejects.toThrow("Nenhum valor pendente");
  });
});

describe("cancelling a payment keeps the same error mappings", () => {
  it.each([
    [{ code: "40001", message: "STALE_OBLIGATION" }, "cobrança mudou"],
    [{ code: "23514", message: "NO_OBLIGATION" }, "Nenhum valor pendente"],
  ])("maps %j", async (error, expected) => {
    mocks.rpcResult.mockResolvedValue({ data: null, error });
    await expect(unmarkMonthlyChargePaid("C", "payment")).rejects.toThrow(expected);
  });
});

describe("listCycleCharges", () => {
  const row = { id: "C1", user_id: "A", passenger_id: "P1", reference_month: "2026-11-01", period_start: "2026-11-01", period_end: "2026-12-06", total_amount: 126, paid_amount: 90, paid: false, paid_at: null, revision: 3, active_payment_id: null, created_at: "t" };

  it("reads every charge, newest period_end first, and maps the period", async () => {
    mocks.result.mockReturnValue({ data: [row], error: null });
    const [charge] = await listCycleCharges();
    expect(mocks.from).toHaveBeenCalledWith("monthly_charges");
    expect(spy("select")).toHaveBeenCalledWith("*");
    expect(spy("order")).toHaveBeenNthCalledWith(1, "period_end", { ascending: false });
    expect(spy("order")).toHaveBeenNthCalledWith(2, "period_start", { ascending: false });
    expect(spy("eq")).not.toHaveBeenCalled();
    expect(charge).toMatchObject({ id: "C1", referenceMonth: "2026-11-01", periodStart: "2026-11-01", periodEnd: "2026-12-06", totalAmount: 126, paidAmount: 90 });
  });

  it("hides database details on failure", async () => {
    mocks.result.mockReturnValue({ data: null, error: { code: "XX000", message: "private internal secret" } });
    await expect(listCycleCharges()).rejects.toThrow("Não foi possível concluir a operação");
  });
});

describe("listPaymentEventsForCharges", () => {
  const event = { id: "E1", monthly_charge_id: "C1", kind: "PAYMENT", revision: 1, signed_amount: 90, related_payment_id: null };

  it("filters by charge ids and by payment kinds, not by reference month", async () => {
    mocks.result.mockReturnValue({ data: [event], error: null });
    const result = await listPaymentEventsForCharges(["C1", "C2"]);
    expect(mocks.from).toHaveBeenCalledWith("monthly_charge_events");
    expect(spy("in")).toHaveBeenNthCalledWith(1, "monthly_charge_id", ["C1", "C2"]);
    expect(spy("in")).toHaveBeenNthCalledWith(2, "kind", ["PAYMENT", "CANCEL"]);
    expect(spy("eq")).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: "E1", monthlyChargeId: "C1", kind: "PAYMENT", revision: 1, signedAmount: 90, relatedPaymentId: null }]);
  });

  it("makes no query when there are no charges", async () => {
    expect(await listPaymentEventsForCharges([])).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("splits a long list in chunks of 100 and joins the answers", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `C${i}`);
    mocks.result.mockReturnValue({ data: [event], error: null });
    const result = await listPaymentEventsForCharges(ids);
    const chunks = spy("in").mock.calls.filter(([column]) => column === "monthly_charge_id").map(([, list]) => (list as string[]).length);
    expect(chunks).toEqual([100, 100, 50]);
    expect(result).toHaveLength(3);
  });

  it("fails with the generic message when a chunk fails", async () => {
    mocks.result.mockReturnValue({ data: null, error: { code: "XX000", message: "private" } });
    await expect(listPaymentEventsForCharges(["C1"])).rejects.toThrow("Não foi possível concluir a operação");
  });
});

describe.each([
  ["listRidesByPeriod", listRidesByPeriod, "rides", "ride_date"],
  ["listReceivedRidesByPeriod", listReceivedRidesByPeriod, "received_rides", "received_date"],
] as const)("%s", (_name, list, table, column) => {
  it("uses gte and lte, so both ends are included", async () => {
    await list("2026-11-01", "2026-12-06", "P");
    expect(mocks.from).toHaveBeenCalledWith(table);
    expect(spy("gte")).toHaveBeenCalledWith(column, "2026-11-01");
    expect(spy("lte")).toHaveBeenCalledWith(column, "2026-12-06");
    expect(spy("order")).toHaveBeenCalledWith(column);
    expect(spy("eq")).toHaveBeenCalledWith("passenger_id", "P");
  });

  it("does not filter by passenger when none is given", async () => {
    await list("2026-12-06", "2026-12-06");
    expect(spy("gte")).toHaveBeenCalledWith(column, "2026-12-06");
    expect(spy("lte")).toHaveBeenCalledWith(column, "2026-12-06");
    expect(spy("eq")).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-12-07", "2026-12-06"],
    ["2026-02-30", "2026-03-01"],
    ["2026-11-01", "06/12/2026"],
    ["", "2026-12-06"],
  ])("rejects the period %j to %j before any query", async (start, end) => {
    await expect(list(start, end)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("hides database details on failure", async () => {
    mocks.result.mockReturnValue({ data: null, error: { code: "XX000", message: "private internal secret" } });
    await expect(list("2026-11-01", "2026-12-06")).rejects.toThrow("Não foi possível concluir a operação");
  });
});

describe("BEFORE_FIRST_CYCLE on ride and compensation creation", () => {
  const hint = "Esta data é anterior ao primeiro fechamento deste passageiro (início em 2025-03-07).";
  const shown = "Esta data é anterior ao primeiro fechamento deste passageiro (início em 07/03/2025).";
  const rejection = (message: string, withHint = true) => ({ data: null, error: { code: "23514", message, hint: withHint ? hint : null } });

  it("createRide shows the hint with the date as dd/mm/yyyy", async () => {
    spy("single").mockResolvedValue(rejection("BEFORE_FIRST_CYCLE"));
    await expect(createRide({ passengerId: "P", rideDate: "2025-03-06" })).rejects.toThrow(shown);
  });

  it("createReceivedRide shows the hint with the date as dd/mm/yyyy", async () => {
    spy("single").mockResolvedValue(rejection("BEFORE_FIRST_CYCLE"));
    await expect(createReceivedRide({ passengerId: "P", receivedDate: "2025-03-06", amount: 10 })).rejects.toThrow(shown);
  });

  it("both fall back to the fixed text when the hint is missing", async () => {
    spy("single").mockResolvedValue(rejection("BEFORE_FIRST_CYCLE", false));
    await expect(createRide({ passengerId: "P", rideDate: "2025-03-06" })).rejects.toThrow("anterior ao primeiro fechamento do passageiro");
    await expect(createReceivedRide({ passengerId: "P", receivedDate: "2025-03-06", amount: 10 })).rejects.toThrow("anterior ao primeiro fechamento do passageiro");
  });

  it("FUTURE_DATE and duplicate keep their own messages", async () => {
    spy("single").mockResolvedValue({ data: null, error: { code: "23514", message: "FUTURE_DATE", hint: "A data de fim do ciclo não pode ser futura." } });
    await expect(createRide({ passengerId: "P", rideDate: "2026-12-10" })).rejects.toThrow("Não é possível registrar uma data futura.");
    await expect(createReceivedRide({ passengerId: "P", receivedDate: "2026-12-10", amount: 10 })).rejects.toThrow("Não é possível registrar uma data futura.");
    spy("single").mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    await expect(createRide({ passengerId: "P", rideDate: "2026-12-09" })).rejects.toThrow("já tem uma diária registrada nesta data");
  });

  it("other errors stay generic", async () => {
    spy("single").mockResolvedValue({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    await expect(createRide({ passengerId: "P", rideDate: "2026-12-09" })).rejects.toThrow("Não foi possível concluir a operação");
    await expect(createReceivedRide({ passengerId: "P", receivedDate: "2026-12-09", amount: 10 })).rejects.toThrow("Não foi possível concluir a operação");
  });
});
