import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillingSummary } from "@/components/charges/BillingSummary";
import { MonthHero } from "@/components/charges/MonthHero";
import { MonthlyChargeCard } from "@/components/charges/MonthlyChargeCard";
import { addCents, debtLabel, toCents } from "@/utils/money";
const props = { passengerName: "Pessoa", amount: 10, status: "closed" as const, rideAmount: 10, compensationAmount: 0, paid: false, toggling: false, generatingReceipt: false, onMarkPaid: vi.fn(), onUnmarkPaid: vi.fn(), onGenerateReceipt: vi.fn() };
describe("integer financial domain", () => {
  it.each([["10.50", 1050], ["-10.50", -1050], [0, 0], [0.1, 10], [0.2, 20]])("converts %s exactly", (value, cents) => expect(toCents(value!)).toBe(cents));
  it("does not hide excess precision", () => { expect(() => toCents(0.1 + 0.2)).toThrow(); expect(() => toCents("1.001")).toThrow(); });
  it("rejects unsafe sums", () => expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow());
  it("adds cents exactly", () => expect(addCents(toCents(0.1), toCents(0.2))).toBe(30));
  it("direction changes by signed cents", () => { expect(debtLabel(100)).toContain("Passageiro deve"); expect(debtLabel(-100)).toContain("Você deve"); expect(debtLabel(0)).toBe("Nenhum valor pendente"); });
});
describe("integral payment card", () => {
  it.each([10, -10])("pending %s can be paid in either direction", (amount) => { render(<MonthlyChargeCard {...props} amount={amount} />); fireEvent.click(screen.getByText("Marcar como pago")); expect(props.onMarkPaid).toHaveBeenCalled(); expect(screen.getByText(amount > 0 ? /Passageiro deve/ : /Você deve/)).toBeTruthy(); });
  it("zero never shows a payment or cancel button", () => { render(<MonthlyChargeCard {...props} amount={0} paid />); expect(screen.getByText("Nenhum valor pendente")).toBeTruthy(); expect(screen.queryByText("Marcar como pago")).toBeNull(); expect(screen.queryByText("Desmarcar pagamento")).toBeNull(); });
  it("paid can be cancelled", () => { render(<MonthlyChargeCard {...props} paid />); fireEvent.click(screen.getByText("Desmarcar pagamento")); expect(props.onUnmarkPaid).toHaveBeenCalled(); expect(screen.getByText("Pago")).toBeTruthy(); });
  it("same total stays paid; change reopens pending; zero has no obligation", () => {
    const view = render(<MonthlyChargeCard {...props} paid />);
    view.rerender(<MonthlyChargeCard {...props} paid />); expect(screen.getByText("Pago")).toBeTruthy();
    view.rerender(<MonthlyChargeCard {...props} amount={-20} paid={false} />); expect(screen.getByText("Pendente")).toBeTruthy(); expect(screen.getByText(/Você deve/)).toBeTruthy();
    view.rerender(<MonthlyChargeCard {...props} amount={0} paid />); expect(screen.queryByText("Pago")).toBeNull(); expect(screen.queryByText("Marcar como pago")).toBeNull();
  });
  it("outdated charge cannot be paid or cancelled", () => { render(<MonthlyChargeCard {...props} status="outdated" computedAmount={20} />); expect(screen.queryByText("Marcar como pago")).toBeNull(); });
  it("partial charge shows only the outstanding amount as owed", () => { render(<MonthlyChargeCard {...props} amount={20} paidAmount={5} />); expect(screen.getByText(/Passageiro deve R\$\s15,00/)).toBeTruthy(); expect(screen.queryByText(/Passageiro deve R\$\s20,00/)).toBeNull(); expect(screen.getByText("Parcialmente pago")).toBeTruthy(); });
});
describe("billing summary", () => {
  it("counts a settled charge with refund as paid and a partial one as pending", () => {
    render(<BillingSummary rows={[{ amount: 0, paidAmount: 20, paid: true, status: "closed" }, { amount: 20, paidAmount: 5, paid: false, status: "closed" }]} />);
    expect(screen.getByText(/1 pendente\b/)).toBeTruthy(); expect(screen.getByText(/1 paga\b/)).toBeTruthy();
  });
});
describe("month hero", () => {
  it("splits a partial charge into paid and open, and shows overpayment as refund", () => {
    render(<MonthHero monthLabel="outubro" rows={[{ amount: 100, paidAmount: 60, paid: false, status: "closed" }, { amount: 0, paidAmount: 20, paid: true, status: "closed" }]} />);
    expect(screen.getAllByText(/^R\$\s40,00$/).length).toBeGreaterThan(0); expect(screen.getByText(/^R\$\s60,00$/)).toBeTruthy(); expect(screen.queryByText(/^R\$\s100,00$/)).toBeNull();
    expect(screen.getByText(/Saldo a devolver: R\$\s20,00/)).toBeTruthy();
  });
});
