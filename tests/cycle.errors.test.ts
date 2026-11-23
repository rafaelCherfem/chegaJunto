import { describe, expect, it } from "vitest";
import { cycleErrorToken, mapCycleError } from "@/lib/cycleErrors";
import { formatIsoDatesInText } from "@/utils/date";

const cases = [
  ["INVALID_CYCLE_END", "23514", "Escolha uma data de fim válida."],
  ["FUTURE_DATE", "23514", "A data de fim não pode ser futura."],
  ["CYCLE_OVERLAP", "23514", "Este período se sobrepõe a um ciclo já fechado."],
  ["BEFORE_FIRST_CYCLE", "23514", "Esta data é anterior ao primeiro fechamento do passageiro."],
  ["FINANCIAL_FORBIDDEN", "42501", "Você não tem permissão para esta operação."],
] as const;

describe("mapCycleError", () => {
  it.each(cases)("%s without a hint uses the fixed Portuguese text", (token, code, text) => {
    expect(mapCycleError({ code, message: token })?.message).toBe(text);
    expect(mapCycleError({ code, message: token, hint: null })?.message).toBe(text);
    expect(mapCycleError({ code, message: token, hint: "   " })?.message).toBe(text);
    expect(cycleErrorToken({ code, message: token })).toBe(token);
  });

  it.each(cases)("%s with a hint shows the hint from the database", (token, code) => {
    const hint = "Texto vindo do banco, sem datas.";
    expect(mapCycleError({ code, message: token, hint })?.message).toBe(hint);
  });

  it("rewrites the ISO date inside the BEFORE_FIRST_CYCLE hint as dd/mm/yyyy", () => {
    const error = mapCycleError({
      code: "23514",
      message: "BEFORE_FIRST_CYCLE",
      hint: "Esta data é anterior ao primeiro fechamento deste passageiro (início em 2025-03-07).",
    });
    expect(error?.message).toBe(
      "Esta data é anterior ao primeiro fechamento deste passageiro (início em 07/03/2025).",
    );
  });

  it("matches the token inside a longer message, as FUTURE_DATE already does elsewhere", () => {
    expect(mapCycleError({ code: "23514", message: "CYCLE_OVERLAP: detalhe" })?.message).toBe(
      "Este período se sobrepõe a um ciclo já fechado.",
    );
  });

  it("is a plain Error with no database internals", () => {
    const error = mapCycleError({ code: "23514", message: "CYCLE_OVERLAP" });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain("CYCLE_OVERLAP");
  });

  it.each([
    [{ code: "42501", message: "new row violates row-level security policy" }],
    [{ code: "23514", message: "NO_OBLIGATION" }],
    [{ code: "40001", message: "STALE_OBLIGATION" }],
    [{ code: "23P01", message: "conflicting key value violates exclusion constraint" }],
    [{ code: "23514", message: "FINANCIAL_FORBIDDEN" }],
    [{ code: "42501", message: "BEFORE_FIRST_CYCLE" }],
    [{ message: "CYCLE_OVERLAP" }],
    [{}],
  ])("returns null when the error is not one of the five tokens: %j", (error) => {
    expect(mapCycleError(error)).toBeNull();
    expect(cycleErrorToken(error)).toBeNull();
  });
});

describe("formatIsoDatesInText", () => {
  it("formats every valid ISO date and leaves the rest alone", () => {
    expect(formatIsoDatesInText("de 2025-03-07 a 2025-12-06.")).toBe("de 07/03/2025 a 06/12/2025.");
    expect(formatIsoDatesInText("sem datas")).toBe("sem datas");
  });

  it("keeps impossible dates as they came", () => {
    expect(formatIsoDatesInText("em 2025-02-30")).toBe("em 2025-02-30");
    expect(formatIsoDatesInText("em 2025-13-01")).toBe("em 2025-13-01");
  });
});
