import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthlyChargeCard } from "@/components/charges/MonthlyChargeCard";

const props = {
  passengerName: "Lucas Pereira",
  amount: 270,
  paidAmount: 90,
  paid: false,
  status: "closed" as const,
  cycleOpen: true,
  rideAmount: 270,
  compensationAmount: 0,
  toggling: false,
  generatingReceipt: false,
  onMarkPaid: vi.fn(),
  onUnmarkPaid: vi.fn(),
  onGenerateReceipt: vi.fn(),
};

describe("cabeçalho do card de cobrança", () => {
  it("os chips ficam fora da linha do nome e o nome não quebra no meio da palavra", () => {
    render(<MonthlyChargeCard {...props} />);
    const name = screen.getByText("Lucas Pereira");
    const nameRow = name.parentElement as HTMLElement;
    const chips = [screen.getByText("Ciclo em aberto"), screen.getByText("Parcialmente pago")];

    for (const chip of chips) {
      expect(nameRow.contains(chip)).toBe(false);
      expect(chip.parentElement).toBe(chips[0]!.parentElement);
    }
    expect(chips[0]!.parentElement!.className).toContain("flex-wrap");
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("flex-1");
    expect(name.className).not.toContain("anywhere");
    expect(name.className).not.toContain("break-all");
  });
});
