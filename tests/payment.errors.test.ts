import { describe, expect, it } from "vitest";
import { mapCycleError, mapPaymentError, paymentErrorToken } from "@/lib/cycleErrors";
import { formatCurrency } from "@/utils/currency";

const tokens = [
  ["EXTENSIBLE_CYCLE_OPEN", "Existe um ciclo em aberto. Encerre o ciclo pela tela de cobranças antes de fechar um mês."],
  ["INVALID_PAYMENT_AMOUNT", "Informe um valor maior que zero, com no máximo duas casas decimais."],
  ["NO_OBLIGATION", "Não há nada a receber desta cobrança."],
  ["PAYMENT_EXCEEDS_OUTSTANDING", "O valor é maior que o que falta receber."],
] as const;

describe("mapPaymentError", () => {
  it.each(tokens)("%s without a hint uses the fixed Portuguese text", (token, text) => {
    expect(paymentErrorToken({ code: "23514", message: token })).toBe(token);
    expect(mapPaymentError({ code: "23514", message: token })?.message).toBe(text);
    expect(mapPaymentError({ code: "23514", message: token, hint: null })?.message).toBe(text);
    expect(mapPaymentError({ code: "23514", message: token, hint: "  " })?.message).toBe(text);
  });

  it.each(tokens)("%s with a hint shows the hint from the database", (token) => {
    expect(mapPaymentError({ code: "23514", message: token, hint: "Texto do banco." })?.message).toBe(
      "Texto do banco.",
    );
  });

  it("turns the outstanding amount in the hint into R$ with a decimal comma", () => {
    const error = mapPaymentError({
      code: "23514",
      message: "PAYMENT_EXCEEDS_OUTSTANDING",
      hint: "O valor é maior que o que falta receber. Falta receber 180.00.",
    });
    expect(error?.message).toBe(
      `O valor é maior que o que falta receber. Falta receber ${formatCurrency(180)}.`,
    );
    expect(error?.message).toContain("180,00");
    expect(error?.message).not.toContain("180.00");
  });

  it("formats a thousands amount and keeps the cents", () => {
    const error = mapPaymentError({
      code: "23514",
      message: "PAYMENT_EXCEEDS_OUTSTANDING",
      hint: "Falta receber 1234.50.",
    });
    expect(error?.message).toBe(`Falta receber ${formatCurrency(1234.5)}.`);
  });

  it("does not touch a date in the hint", () => {
    const error = mapPaymentError({
      code: "23514",
      message: "NO_OBLIGATION",
      hint: "Ciclo encerrado em 2026-11-30.",
    });
    expect(error?.message).toBe("Ciclo encerrado em 30/11/2026.");
  });

  it("matches the token inside a longer message", () => {
    expect(mapPaymentError({ code: "23514", message: "NO_OBLIGATION: detalhe" })?.message).toBe(
      "Não há nada a receber desta cobrança.",
    );
  });

  it("is a plain Error with no database internals", () => {
    const error = mapPaymentError({ code: "23514", message: "INVALID_PAYMENT_AMOUNT" });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain("INVALID_PAYMENT_AMOUNT");
  });

  it.each([
    [{ code: "40001", message: "STALE_OBLIGATION" }],
    [{ code: "42501", message: "NO_OBLIGATION" }],
    [{ code: "42501", message: "FINANCIAL_FORBIDDEN" }],
    [{ code: "23514", message: "CYCLE_OVERLAP" }],
    [{ message: "NO_OBLIGATION" }],
    [{}],
  ])("returns null for anything else: %j", (error) => {
    expect(mapPaymentError(error)).toBeNull();
    expect(paymentErrorToken(error)).toBeNull();
  });

  it("does not take over the five cycle tokens, and they do not take over these", () => {
    expect(mapCycleError({ code: "23514", message: "NO_OBLIGATION" })).toBeNull();
    expect(mapPaymentError({ code: "23514", message: "CYCLE_OVERLAP" })).toBeNull();
  });
});
