import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeSheet } from "@/components/charges/ChargeSheet";
import { MonthHero } from "@/components/charges/MonthHero";
import { MonthlyChargeCard } from "@/components/charges/MonthlyChargeCard";

type Case = { amount: number; paidAmount: number; paid: boolean };

// O caso real: diárias R$ 5,00, compensação R$ 20,00, total do mês -R$ 15,00.
const pendingRefund: Case = { amount: -15, paidAmount: 0, paid: false };
const doneRefund: Case = { amount: -15, paidAmount: -15, paid: true };
const partialRefund: Case = { amount: -15, paidAmount: -5, paid: false };
// Total R$ 5,00, pago R$ 20,00: saldo a devolver de R$ 15,00.
const overpaid: Case = { amount: 5, paidAmount: 20, paid: true };

function props(c: Case) {
  return {
    passengerName: "Anônimo 4",
    amount: c.amount,
    paidAmount: c.paidAmount,
    paid: c.paid,
    status: "closed" as const,
    rideAmount: 5,
    compensationAmount: 20,
    canUnmarkPaid: c.paid,
    toggling: false,
    generatingReceipt: false,
    onMarkPaid: vi.fn(),
    onUnmarkPaid: vi.fn(),
    onGenerateReceipt: vi.fn(),
  };
}

const closed = (c: Case) => ({ ...c, status: "closed" as const });

describe("cobrança com total negativo (devolução)", () => {
  it("sem devolução registrada: chip A devolver e botão de devolução", () => {
    render(<MonthlyChargeCard {...props(pendingRefund)} />);
    expect(screen.getByText("A devolver")).toBeTruthy();
    expect(screen.getByText(/Você deve R\$\s15,00 ao passageiro/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar como devolvido" })).toBeTruthy();
    expect(screen.queryByText("Pago")).toBeNull();
    expect(screen.queryByText("Pendente")).toBeNull();
    expect(screen.queryByText("Pagamento recebido")).toBeNull();
    expect(screen.queryByRole("button", { name: /Pagar|Marcar como pago/ })).toBeNull();
  });

  it("com devolução registrada: Devolvido, nunca Pago nem Pagamento recebido", () => {
    render(<MonthlyChargeCard {...props(doneRefund)} />);
    expect(screen.getByText("Devolvido")).toBeTruthy();
    expect(screen.getByText("Devolução feita")).toBeTruthy();
    expect(screen.queryByText("Pago")).toBeNull();
    expect(screen.queryByText("A devolver")).toBeNull();
    expect(screen.queryByText("Pagamento recebido")).toBeNull();
    expect(screen.queryByText(/Já pago/)).toBeNull();
    expect(screen.queryByRole("button", { name: /devolvido|Pagar|pago/i })).toBeNull();
  });

  it("devolução parcial: mostra o que já foi devolvido e o que falta", () => {
    render(<MonthlyChargeCard {...props(partialRefund)} />);
    expect(screen.getByText("Devolução parcial")).toBeTruthy();
    expect(screen.getByText(/Já devolvido: R\$\s5,00 · Falta devolver: R\$\s10,00/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Devolver R\$\s10,00$/ })).toBeTruthy();
    expect(screen.queryByText(/Parcialmente pago/)).toBeNull();
  });

  it("sheet sem devolução: chip, saldo a devolver e botão de devolução", () => {
    render(<ChargeSheet {...props(pendingRefund)} monthLabel="outubro de 2026" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("A devolver")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Saldo a devolver")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Marcar como devolvido" })).toBeTruthy();
    expect(within(dialog).queryByText(/Já pago/)).toBeNull();
  });

  it("sheet com devolução: Devolução feita, Já devolvido e Desmarcar devolução", () => {
    render(<ChargeSheet {...props(doneRefund)} monthLabel="outubro de 2026" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Devolução feita")).toBeTruthy();
    expect(screen.getByText("Já devolvido")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desmarcar devolução" })).toBeTruthy();
    expect(screen.queryByText("Pagamento recebido")).toBeNull();
    expect(screen.queryByText(/Já pago/)).toBeNull();
    expect(screen.queryByText("Desmarcar pagamento")).toBeNull();
  });

  it("sheet com devolução parcial: Já devolvido e Falta devolver", () => {
    render(<ChargeSheet {...props(partialRefund)} monthLabel="outubro de 2026" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Já devolvido")).toBeTruthy();
    expect(screen.getByText("Falta devolver")).toBeTruthy();
    expect(screen.queryByText("Saldo a devolver")).toBeNull();
  });
});

describe("MonthHero concorda com o card", () => {
  it("devolução pendente entra no saldo a devolver e bloqueia Tudo recebido", () => {
    render(<MonthHero monthLabel="outubro" rows={[closed({ amount: 30, paidAmount: 30, paid: true }), closed(pendingRefund)]} />);
    expect(screen.getByText(/Saldo a devolver: R\$\s15,00/)).toBeTruthy();
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    expect(screen.getByText(/1 pendente/)).toBeTruthy();
  });

  it("devolução feita sai do saldo a devolver e conta como paga", () => {
    render(<MonthHero monthLabel="outubro" rows={[closed({ amount: 30, paidAmount: 30, paid: true }), closed(doneRefund)]} />);
    expect(screen.queryByText(/Saldo a devolver/)).toBeNull();
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    expect(screen.getByText(/0 pendentes/)).toBeTruthy();
    expect(screen.getByText(/2 pagas/)).toBeTruthy();
  });

  it("devolução parcial soma só o que falta devolver", () => {
    render(<MonthHero monthLabel="outubro" rows={[closed({ amount: 30, paidAmount: 30, paid: true }), closed(partialRefund)]} />);
    expect(screen.getByText(/Saldo a devolver: R\$\s10,00/)).toBeTruthy();
    expect(screen.queryByText("Tudo recebido")).toBeNull();
  });

  it("total positivo pago a mais: saldo a devolver, pendente e sem Tudo recebido", () => {
    render(<MonthHero monthLabel="julho" rows={[closed(overpaid)]} />);
    expect(screen.getByText(/Saldo a devolver: R\$\s15,00/)).toBeTruthy();
    expect(screen.queryByText("Tudo recebido")).toBeNull();
    expect(screen.getByText(/1 pendente\b/)).toBeTruthy();
    expect(screen.getByText(/0 pagas/)).toBeTruthy();
  });

  it("sem saldo a devolver (pago exato) tudo volta ao normal", () => {
    render(<MonthHero monthLabel="julho" rows={[closed({ amount: 5, paidAmount: 5, paid: true })]} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    expect(screen.queryByText(/Saldo a devolver/)).toBeNull();
    expect(screen.getByText(/0 pendentes/)).toBeTruthy();
    expect(screen.getByText(/1 paga\b/)).toBeTruthy();
  });
});

describe("cobrança paga a mais (total positivo, pago maior)", () => {
  it("card: chip A devolver e texto de pago a mais, sem Pagamento recebido", () => {
    const { container } = render(<MonthlyChargeCard {...props(overpaid)} />);
    expect(screen.getByText("A devolver")).toBeTruthy();
    expect(screen.getByText(/Pago a mais · devolva R\$\s15,00/)).toBeTruthy();
    expect(screen.queryByText("Pagamento recebido")).toBeNull();
    expect(screen.queryByText("Pago")).toBeNull();
    expect(container.querySelector(".avatar--due")).not.toBeNull();
  });

  it("sheet: chip A devolver, saldo a devolver e texto de pago a mais", () => {
    render(<ChargeSheet {...props(overpaid)} monthLabel="outubro de 2026" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("A devolver")).toBeTruthy();
    expect(screen.getByText(/Pago a mais · devolva R\$\s15,00/)).toBeTruthy();
    expect(screen.getByText("Saldo a devolver")).toBeTruthy();
    expect(screen.queryByText("Pagamento recebido")).toBeNull();
  });

  it("pago exato: volta a Pago e Pagamento recebido", () => {
    const { container } = render(
      <MonthlyChargeCard {...props({ amount: 5, paidAmount: 5, paid: true })} />,
    );
    expect(screen.getByText("Pago")).toBeTruthy();
    expect(screen.getByText("Pagamento recebido")).toBeTruthy();
    expect(screen.queryByText("A devolver")).toBeNull();
    expect(container.querySelector(".avatar--done")).not.toBeNull();
  });
});
