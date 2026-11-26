import { describe, expect, it } from "vitest";
import { amountToInput, parseAmountToCents, typeAmount } from "@/utils/paymentAmount";

describe("typeAmount", () => {
  it.each(["", "1", "12", "12,", "12.", "12,3", "12,34", "12.34", ",5"])("accepts %j", (value) => {
    expect(typeAmount("x", value)).toEqual({ text: value, rejected: false });
  });

  it.each(["12,345", "12.345", "1,2,3", "1.234,56", "abc", "-1", "1 2", "R$ 5"])(
    "rejects %j and keeps what was there before",
    (value) => {
      expect(typeAmount("12,3", value)).toEqual({ text: "12,3", rejected: true });
    },
  );
});

describe("parseAmountToCents", () => {
  it("reads comma and dot as the decimal separator, in exact cents", () => {
    expect(parseAmountToCents("12,5")).toBe(1250);
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("0,1")).toBe(10);
    expect(parseAmountToCents("19,99")).toBe(1999);
    expect(parseAmountToCents("50")).toBe(5000);
  });

  it("reads the currency mask the field shows when it loses focus", () => {
    expect(parseAmountToCents("R$ 50,00")).toBe(5000);
    expect(parseAmountToCents("R$ 1.234,56")).toBe(123456);
  });

  it("keeps zero as zero, so the caller can refuse it", () => {
    expect(parseAmountToCents("0")).toBe(0);
    expect(parseAmountToCents("0,00")).toBe(0);
  });

  it("is null for empty, partial or invalid text", () => {
    for (const text of ["", " ", ",", "12,", "12,345", "abc", "1,2,3"]) {
      expect(parseAmountToCents(text)).toBeNull();
    }
  });
});

describe("amountToInput", () => {
  it("writes cents back as editable text", () => {
    expect(amountToInput(123450)).toBe("1234,50");
    expect(amountToInput(5)).toBe("0,05");
    expect(amountToInput(5000)).toBe("50,00");
  });
});
