import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadError, loadErrorFrom, loadErrorKind } from "@/lib/loadErrors";
import { hasNoOpenCycle, latestClosedEnd, openCycleStart } from "@/utils/cycles";
import type { MonthlyCharge } from "@/types/entities";

const charge = (passengerId: string, periodEnd: string): MonthlyCharge => ({
  id: `${passengerId}-${periodEnd}`,
  passengerId,
  referenceMonth: "2026-11-01",
  periodStart: "2026-11-01",
  periodEnd,
  totalAmount: 10,
  paid: false,
  paidAmount: 0,
  revision: 1,
  activePaymentId: null,
  paidAt: null,
  createdAt: "2026-11-01T00:00:00Z", extensible: false,
});

describe("open cycle start", () => {
  const today = "2026-11-23";
  it("is the day after the smallest last end", () => {
    expect(openCycleStart([charge("a", "2026-11-30"), charge("b", "2026-11-10")], today)).toBe("2026-11-11");
  });
  it("is null when it would fall after today", () => {
    expect(openCycleStart([charge("a", "2026-11-30"), charge("b", "2026-11-23")], today)).toBeNull();
  });
  it("is today when the last end is yesterday", () => {
    expect(openCycleStart([charge("a", "2026-11-22")], today)).toBe("2026-11-23");
  });
  it("is null when nobody closed", () => {
    expect(openCycleStart([], today)).toBeNull();
  });
});

describe("no open cycle", () => {
  const today = "2026-11-23";
  it("holds when every closed passenger ends today or later and nobody is unclosed", () => {
    expect(hasNoOpenCycle([charge("a", "2026-11-30"), charge("b", "2026-11-23")], [], today)).toBe(true);
  });
  it("does not hold when one passenger ended before today", () => {
    expect(hasNoOpenCycle([charge("a", "2026-11-30"), charge("b", "2026-11-22")], [], today)).toBe(false);
  });
  it("does not hold when a passenger never closed", () => {
    expect(hasNoOpenCycle([charge("a", "2026-11-30")], ["c"], today)).toBe(false);
  });
  it("does not hold when nobody closed", () => {
    expect(hasNoOpenCycle([], [], today)).toBe(false);
  });
  it("latest closed end is the largest end", () => {
    expect(latestClosedEnd([charge("a", "2026-11-30"), charge("b", "2026-11-23")])).toBe("2026-11-30");
    expect(latestClosedEnd([])).toBeNull();
  });
});

describe("load error classification", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("a fetch failure without a database code is a network error", () => {
    expect(loadErrorFrom({ code: "", message: "TypeError: Failed to fetch" }).kind).toBe("network");
  });
  it("an error with a database code is a data error", () => {
    expect(loadErrorFrom({ code: "42P01", message: "relation does not exist" }).kind).toBe("data");
  });
  it("offline is a network error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(loadErrorFrom({ code: "42P01", message: "x" }).kind).toBe("network");
    expect(loadErrorKind(new Error("qualquer"))).toBe("network");
  });
  it("keeps the generic message and the cause", () => {
    const cause = { code: "42P01", message: "x" };
    const error = loadErrorFrom(cause);
    expect(error).toBeInstanceOf(LoadError);
    expect(error.message).toBe("Não foi possível concluir a operação. Tente novamente.");
    expect(error.cause).toBe(cause);
  });
  it("a plain error is a data error", () => {
    expect(loadErrorKind(new Error("Período inválido: o início vem depois do fim."))).toBe("data");
  });
});
