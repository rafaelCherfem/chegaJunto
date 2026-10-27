import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthHero } from "@/components/charges/MonthHero";

describe("MonthHero: Tudo recebido", () => {
  const closed = (amount: number, paidAmount: number, paid: boolean) => ({
    amount,
    paidAmount,
    paid,
    status: "closed" as const,
  });

  it("aparece quando todas as cobranças estão quitadas", () => {
    render(<MonthHero monthLabel="setembro" rows={[closed(210, 210, true), closed(312, 312, true)]} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
  });

  it("aparece com saldo a devolver e mantém a linha do saldo", () => {
    render(<MonthHero monthLabel="julho" rows={[closed(100, 100, true), closed(204, 254, true)]} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    expect(screen.getByText(/Saldo a devolver: R\$\s50,00/)).toBeTruthy();
  });

  it("não aparece com pendência ou pagamento parcial", () => {
    render(<MonthHero monthLabel="outubro" rows={[closed(230, 230, true), closed(256, 231, false)]} />);
    expect(screen.queryByText("Tudo recebido")).toBeNull();
  });

  it("não aparece enquanto houver prévia ou cobrança desatualizada", () => {
    const { rerender } = render(
      <MonthHero monthLabel="outubro" rows={[closed(100, 100, true), { amount: 50, paid: false, status: "preview" }]} />,
    );
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    rerender(
      <MonthHero monthLabel="outubro" rows={[closed(100, 100, true), { amount: 50, paid: false, status: "outdated" }]} />,
    );
    expect(screen.queryByText("Tudo recebido")).toBeNull();
  });

  it("não aparece no mês vazio nem quando só há valor devolvido", () => {
    const { rerender } = render(<MonthHero monthLabel="agosto" rows={[]} />);
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    rerender(<MonthHero monthLabel="agosto" rows={[closed(0, 20, true)]} />);
    expect(screen.queryByText("Tudo recebido")).toBeNull();
  });
});
