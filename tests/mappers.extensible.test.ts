import { describe, expect, it } from "vitest";
import { toCycleSummaryRow, toMonthlyCharge } from "@/lib/mappers";
import type { CycleSummaryDbRow, Database } from "@/types/database";

type ChargeRow = Database["public"]["Tables"]["monthly_charges"]["Row"];

const chargeRow: ChargeRow = {
  revision: 2,
  active_payment_id: null,
  recalculated_at: "2026-11-24T12:00:00Z",
  id: "C1",
  user_id: "U",
  passenger_id: "P1",
  reference_month: "2026-11-01",
  period_start: "2026-11-01",
  period_end: "2026-11-30",
  total_amount: 100,
  paid: false,
  paid_amount: 40,
  paid_at: null,
  created_at: "2026-12-01T12:00:00Z",
};

const summaryRow: CycleSummaryDbRow = {
  passenger_id: "P1",
  status: "EXTENDED",
  reason: null,
  charge_id: "C1",
  period_start: "2026-11-01",
  period_end: "2026-12-10",
  total_amount: 150,
};

describe("toMonthlyCharge and the extensible column", () => {
  it("reads extensible = true", () => {
    expect(toMonthlyCharge({ ...chargeRow, extensible: true }).extensible).toBe(true);
  });
  it("reads extensible = false", () => {
    expect(toMonthlyCharge({ ...chargeRow, extensible: false }).extensible).toBe(false);
  });
  it("is false when the database has no such column yet", () => {
    expect(toMonthlyCharge(chargeRow).extensible).toBe(false);
  });
  it("keeps the other fields as they were", () => {
    expect(toMonthlyCharge(chargeRow)).toMatchObject({
      id: "C1",
      passengerId: "P1",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      totalAmount: 100,
      paidAmount: 40,
      revision: 2,
    });
  });
});

describe("toCycleSummaryRow and the new columns", () => {
  it("reads paid, due and refund amounts", () => {
    expect(toCycleSummaryRow({ ...summaryRow, paid_amount: 40, amount_due: 110, refund_due: 0 })).toEqual({
      passengerId: "P1",
      status: "EXTENDED",
      reason: null,
      chargeId: "C1",
      periodStart: "2026-11-01",
      periodEnd: "2026-12-10",
      totalAmount: 150,
      paidAmount: 40,
      amountDue: 110,
      refundDue: 0,
    });
  });
  it("keeps zero as zero (not as missing)", () => {
    const row = toCycleSummaryRow({ ...summaryRow, paid_amount: 0, amount_due: 0, refund_due: 0 });
    expect(row.paidAmount).toBe(0);
    expect(row.amountDue).toBe(0);
    expect(row.refundDue).toBe(0);
  });
  it("is null for an explicit null (no charge affected)", () => {
    const row = toCycleSummaryRow({ ...summaryRow, status: "SKIPPED", paid_amount: null, amount_due: null, refund_due: null });
    expect([row.paidAmount, row.amountDue, row.refundDue]).toEqual([null, null, null]);
  });
  it("is null when the database does not return the columns (no migration 0014)", () => {
    const row = toCycleSummaryRow(summaryRow);
    expect([row.paidAmount, row.amountDue, row.refundDue]).toEqual([null, null, null]);
  });
});
