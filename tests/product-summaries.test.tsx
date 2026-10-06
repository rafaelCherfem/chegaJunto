import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailySummary } from "@/components/rides/DailySummary";
import { BillingSummary } from "@/components/charges/BillingSummary";
import type { Passenger } from "@/types/entities";

const passenger = (id: string, active = true): Passenger => ({
  id,
  active,
  name: id,
  defaultDailyRate: 10,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
});

describe("resumos de apresentação", () => {
  it("conta só os passageiros ativos, sem incluir IDs externos ou duplicar registros", () => {
    render(
      <DailySummary
        passengers={[passenger("A"), passenger("B"), passenger("C", false)]}
        registeredIds={new Set(["A", "A", "C", "externo"])}
        isToday
      />,
    );
    expect(screen.getByText("1 de 2")).toBeTruthy();
    expect(screen.getByText(/carona registrada hoje/)).toBeTruthy();
  });
  it("identifica uma data selecionada que não é hoje", () => {
    render(
      <DailySummary
        passengers={[passenger("A")]}
        registeredIds={new Set()}
        isToday={false}
      />,
    );
    expect(screen.getByText("0 de 1")).toBeTruthy();
    expect(screen.getByText(/caronas registradas nesta data/)).toBeTruthy();
  });
  it("não mostra progresso nem divisão por zero sem passageiros ativos", () => {
    const { container } = render(
      <DailySummary
        passengers={[passenger("A", false)]}
        registeredIds={new Set(["A"])}
        isToday
      />,
    );
    expect(screen.getByText("0 de 0")).toBeTruthy();
    expect(container.querySelector(".daily-progress")).toBeNull();
  });
  it("distingue obrigação, saldo zero, prévia e fechamento desatualizado", () => {
    render(
      <BillingSummary
        rows={[
          { amount: 80, paid: false, status: "closed" },
          { amount: -20, paid: true, status: "closed" },
          { amount: 0, paid: true, status: "closed" },
          { amount: 90, paid: true, status: "outdated" },
          { amount: 50, paid: false, status: "preview" },
        ]}
      />,
    );
    expect(screen.getByText(/1 pendente/)).toBeTruthy();
    expect(screen.getByText(/1 paga/)).toBeTruthy();
    expect(screen.getByText(/1 prévia · 1 desatualizada/)).toBeTruthy();
  });
  it("inclui obrigações negativas pendentes sem classificá-las como a receber", () => {
    render(
      <BillingSummary
        rows={[
          { amount: -80, paid: false, status: "closed" },
          { amount: 20, paid: false, status: "closed" },
          { amount: 0, paid: false, status: "closed" },
        ]}
      />,
    );
    expect(screen.getByText(/2 pendentes/)).toBeTruthy();
    expect(screen.getByText(/0 pagas/)).toBeTruthy();
    expect(screen.queryByText(/Saldos positivos e negativos/)).toBeNull();
  });
});
