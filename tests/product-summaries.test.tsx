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
    const { container } = render(
      <DailySummary
        passengers={[passenger("A")]}
        registeredIds={new Set()}
        isToday={false}
      />,
    );
    expect(screen.getByText("0 de 1")).toBeTruthy();
    expect(screen.getByText(/caronas registradas nesta data/)).toBeTruthy();
    expect(container.querySelector(".day-ring")).not.toBeNull();
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
    expect(container.querySelector(".day-ring")).toBeNull();
    expect(container.querySelector(".complete-mark")).toBeNull();
  });
  it("dia completo troca a contagem do anel pelo check e mostra o selo de concluído", () => {
    const { container } = render(
      <DailySummary
        passengers={[passenger("A"), passenger("B"), passenger("C", false)]}
        registeredIds={new Set(["A", "B"])}
        isToday
      />,
    );
    expect(screen.getByText("2 de 2")).toBeTruthy();
    expect(container.querySelector(".day-ring--complete .day-ring__check")).not.toBeNull();
    expect(container.querySelector(".day-ring__label")?.textContent).toBe("");
    expect(screen.getByText("Tudo registrado hoje").className).toBe("complete-mark");
    expect(screen.queryByText(/falta/)).toBeNull();
  });
  it("dia incompleto mantém a contagem e não mostra o selo", () => {
    const { container } = render(
      <DailySummary
        passengers={[passenger("A"), passenger("B")]}
        registeredIds={new Set(["A"])}
        isToday={false}
      />,
    );
    expect(container.querySelector(".day-ring--complete, .complete-mark")).toBeNull();
    expect(container.querySelector(".day-ring__label")?.textContent).toBe("1/2");
    expect(screen.getByText(/falta 1 passageiro/)).toBeTruthy();
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
