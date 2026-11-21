import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeSheet } from "@/components/charges/ChargeSheet";
import { MonthHero } from "@/components/charges/MonthHero";
import { MonthlyChargeCard } from "@/components/charges/MonthlyChargeCard";

const closed = (amount: number, paidAmount: number, paid: boolean) => ({
  amount,
  paidAmount,
  paid,
  status: "closed" as const,
});

describe("MonthHero with cycles", () => {
  it("names the period, not the month", () => {
    render(<MonthHero monthLabel="01/11/2026 a 06/12/2026" rows={[closed(30, 0, false)]} />);
    expect(screen.getByText(/A receber · 01\/11\/2026 a 06\/12\/2026/)).toBeTruthy();
  });

  it("shows what is still open in other cycles", () => {
    render(<MonthHero monthLabel="01/12/2026 a 06/12/2026" rows={[closed(20, 20, true)]} otherOpenCents={3600} />);
    expect(screen.getByText(/Em aberto em outros ciclos: R\$\s36,00/)).toBeTruthy();
  });

  it.each([[0], [undefined]])("hides the line when there is nothing open elsewhere (%s)", (otherOpenCents) => {
    render(<MonthHero monthLabel="01/12/2026 a 06/12/2026" rows={[closed(20, 20, true)]} otherOpenCents={otherOpenCents} />);
    expect(screen.queryByText(/Em aberto em outros ciclos/)).toBeNull();
  });

  it("the other-cycles line does not change the cycle's own total or 'Tudo recebido'", () => {
    const { rerender } = render(<MonthHero monthLabel="x" rows={[closed(20, 20, true)]} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    rerender(<MonthHero monthLabel="x" rows={[closed(20, 20, true)]} otherOpenCents={3600} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    expect(screen.getByText(/Em aberto em outros ciclos/)).toBeTruthy();
  });
});

describe("MonthlyChargeCard with a later start", () => {
  const props = {
    passengerName: "Bia",
    amount: 20,
    status: "closed" as const,
    rideAmount: 20,
    compensationAmount: 0,
    paid: false,
    toggling: false,
    generatingReceipt: false,
    onMarkPaid: vi.fn(),
    onUnmarkPaid: vi.fn(),
    onGenerateReceipt: vi.fn(),
  };

  it("shows 'desde dd/mm' when given", () => {
    render(<MonthlyChargeCard {...props} sinceLabel="desde 05/11" />);
    expect(screen.getByText("desde 05/11")).toBeTruthy();
  });

  it("shows nothing extra without it", () => {
    render(<MonthlyChargeCard {...props} />);
    expect(screen.queryByText(/desde/)).toBeNull();
  });
});

describe("ChargeSheet with a period", () => {
  it("labels the charge with the period and the total as 'do período'", () => {
    render(
      <ChargeSheet
        passengerName="Bia"
        monthLabel="01/11/2026 a 06/12/2026"
        amount={126}
        status="closed"
        rideAmount={126}
        compensationAmount={0}
        paid={false}
        paidAmount={90}
        toggling={false}
        generatingReceipt={false}
        onMarkPaid={vi.fn()}
        onUnmarkPaid={vi.fn()}
        onGenerateReceipt={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Cobrança · 01\/11\/2026 a 06\/12\/2026/)).toBeTruthy();
    expect(screen.getByText("Total do período")).toBeTruthy();
    expect(screen.queryByText("Total do mês")).toBeNull();
  });
});
