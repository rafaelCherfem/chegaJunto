import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RidesPage } from "@/pages/RidesPage";
import { todayISODate } from "@/utils/date";
const state = vi.hoisted(() => ({ rides: [] as Array<{ id: string; passengerId: string; rideDate: string; rateCharged: number }> }));
const create = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePassengers", () => ({ usePassengers: () => ({ data: [{ id: "A", active: true, name: "Ana Souza", defaultDailyRate: 12, createdAt: "2026-10-01", updatedAt: "2026-10-01" }] }) }));
vi.mock("@/hooks/useRides", () => ({ useRidesByMonth: () => ({ data: state.rides }), useCreateRide: () => ({ mutateAsync: create }), useDeleteRide: () => ({ mutateAsync: vi.fn() }) }));
const avatar = () => screen.getByText("AS");
const setDate = (value: string) => fireEvent.change(screen.getByLabelText("Data"), { target: { value } });
const OTHER_DATE = "2026-01-05";
async function registerAna() {
  fireEvent.click(screen.getByRole("button", { name: /^Ana Souza Registrar/ }));
  await waitFor(() => expect(avatar().className).toContain("avatar--done"));
}
beforeEach(() => {
  state.rides = [];
  create.mockReset().mockImplementation(async ({ passengerId, rideDate }: { passengerId: string; rideDate: string }) => { state.rides = [...state.rides, { id: "R1", passengerId, rideDate, rateCharged: 12 }]; });
});
describe("cabeçalho da data na tela de diárias", () => {
  it("mostra 'Hoje' sem empilhar o campo de data", () => {
    const { container } = render(<RidesPage />);
    expect(screen.getByText("Hoje")).toBeTruthy();
    expect(container.querySelector(".ride-date-context--stacked")).toBeNull();
  });
  it("mostra a data completa e empilha o campo quando a data não é hoje", () => {
    const { container } = render(<RidesPage />);
    setDate(OTHER_DATE);
    expect(screen.getByText("05/01/2026")).toBeTruthy();
    expect(screen.queryByText("Hoje")).toBeNull();
    expect(container.querySelector(".ride-date-context--stacked")).not.toBeNull();
  });
});
describe("animação de registro na tela de diárias", () => {
  it("anima só o registro feito agora e limpa quando a animação termina", async () => {
    render(<RidesPage />);
    await registerAna();
    expect(avatar().className).toContain("avatar--pop");
    fireEvent.animationEnd(avatar());
    expect(avatar().className).not.toContain("avatar--pop");
    setDate(OTHER_DATE);
    setDate(todayISODate());
    expect(avatar().className).toContain("avatar--done");
    expect(avatar().className).not.toContain("avatar--pop");
  });
  it("trocar de data no meio da animação também limpa, e voltar não anima de novo", async () => {
    render(<RidesPage />);
    await registerAna();
    setDate(OTHER_DATE);
    setDate(todayISODate());
    expect(avatar().className).toContain("avatar--done");
    expect(avatar().className).not.toContain("avatar--pop");
  });
  it("registro que já existia ao abrir a tela não anima", () => {
    state.rides = [{ id: "R0", passengerId: "A", rideDate: todayISODate(), rateCharged: 12 }];
    const { container } = render(<RidesPage />);
    expect(avatar().className).toContain("avatar--done");
    expect(container.querySelector(".ride-check-in, .avatar--pop")).toBeNull();
  });
});
