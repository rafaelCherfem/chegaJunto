import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeSheet } from "@/components/charges/ChargeSheet";

function sheetProps(overrides: Partial<Parameters<typeof ChargeSheet>[0]> = {}) {
  return {
    passengerName: "Carlos Eduardo Lima",
    monthLabel: "outubro de 2026",
    amount: 256,
    status: "closed" as const,
    rideAmount: 256,
    compensationAmount: 0,
    paid: false,
    paidAmount: 0,
    canUnmarkPaid: false,
    toggling: false,
    generatingReceipt: false,
    onMarkPaid: vi.fn(),
    onUnmarkPaid: vi.fn(),
    onGenerateReceipt: vi.fn(),
    open: true,
    onOpenChange: vi.fn(),
    ...overrides,
  };
}

describe("ChargeSheet", () => {
  it("é um diálogo com o nome do passageiro e o mês", () => {
    render(<ChargeSheet {...sheetProps()} />);
    expect(screen.getByRole("dialog", { name: "Carlos Eduardo Lima" })).toBeTruthy();
    expect(screen.getByText(/Cobrança · outubro de 2026/)).toBeTruthy();
  });

  it("pendente: paga pelo sheet e gera comprovante", () => {
    const props = sheetProps();
    render(<ChargeSheet {...props} />);
    fireEvent.click(screen.getByText("Marcar como pago"));
    fireEvent.click(screen.getByText("Gerar comprovante"));
    expect(props.onMarkPaid).toHaveBeenCalledTimes(1);
    expect(props.onGenerateReceipt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Desmarcar pagamento")).toBeNull();
    expect(screen.getByText(/Passageiro deve R\$\s256,00/)).toBeTruthy();
  });

  it("parcial: cobra só a diferença e ainda permite desmarcar o pagamento mais recente", () => {
    const props = sheetProps({ paidAmount: 231, canUnmarkPaid: true });
    render(<ChargeSheet {...props} />);
    expect(screen.getByText(/Passageiro deve R\$\s25,00/)).toBeTruthy();
    fireEvent.click(screen.getByText(/^Pagar R\$\s25,00$/));
    expect(props.onMarkPaid).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Desmarcar pagamento"));
    expect(props.onUnmarkPaid).toHaveBeenCalledTimes(1);
  });

  it("pago: sem 'Passageiro deve' e com 'Desmarcar pagamento' depois das ações principais", () => {
    const props = sheetProps({ amount: 230, paidAmount: 230, paid: true, canUnmarkPaid: true });
    render(<ChargeSheet {...props} />);
    expect(screen.queryByText(/Passageiro deve/)).toBeNull();
    expect(screen.queryByText("Marcar como pago")).toBeNull();
    const receipt = screen.getByText("Gerar comprovante");
    const undo = screen.getByText("Desmarcar pagamento");
    expect(receipt.compareDocumentPosition(undo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Secundária: variante sem fundo nem borda, longe da ação principal.
    expect(undo.closest("button")?.className).toContain("bg-transparent");
    expect(undo.closest("button")?.className).not.toContain("bg-primary");
    fireEvent.click(undo);
    expect(props.onUnmarkPaid).toHaveBeenCalledTimes(1);
  });

  it("quitado com saldo a devolver: mostra o saldo e não cobra de novo", () => {
    render(<ChargeSheet {...sheetProps({ amount: 204, paidAmount: 254, paid: true })} />);
    expect(screen.getByText("Saldo a devolver")).toBeTruthy();
    expect(screen.getByText(/^R\$\s50,00$/)).toBeTruthy();
    expect(screen.queryByText("Marcar como pago")).toBeNull();
    expect(screen.queryByText(/Passageiro deve/)).toBeNull();
  });

  it("sem pagamento a desfazer não oferece 'Desmarcar pagamento'", () => {
    render(<ChargeSheet {...sheetProps({ amount: 12, paidAmount: 27, paid: true })} />);
    expect(screen.queryByText("Desmarcar pagamento")).toBeNull();
  });

  it("desatualizada: não gera comprovante nem paga", () => {
    render(<ChargeSheet {...sheetProps({ status: "outdated", computedAmount: 300 })} />);
    expect(screen.queryByText("Marcar como pago")).toBeNull();
    expect(screen.getByText("Gerar comprovante").closest("button")?.disabled).toBe(true);
    expect(screen.getByText(/Total atualizado seria R\$\s300,00/)).toBeTruthy();
  });

  it("fecha pelo botão X e pelo ESC", async () => {
    const props = sheetProps();
    render(<ChargeSheet {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledTimes(2));
  });
});
