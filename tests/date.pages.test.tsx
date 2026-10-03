import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RidesPage } from "@/pages/RidesPage";
import { CompensationsPage } from "@/pages/CompensationsPage";
const mocks = vi.hoisted(() => ({
  rideQuery: vi.fn(),
  receivedQuery: vi.fn(),
  ride: vi.fn(),
  received: vi.fn(),
}));
vi.mock("@/hooks/usePassengers", () => ({
  usePassengers: () => ({
    data: [{ id: "P", name: "Synthetic passenger", defaultDailyRate: 10 }],
  }),
}));
vi.mock("@/hooks/useRides", () => ({
  useRidesByMonth: mocks.rideQuery,
  useCreateRide: () => ({ mutateAsync: mocks.ride }),
  useDeleteRide: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useReceivedRides", () => ({
  useReceivedRidesByMonth: mocks.receivedQuery,
  useCreateReceivedRide: () => ({ mutateAsync: mocks.received }),
  useDeleteReceivedRide: () => ({ mutateAsync: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rideQuery.mockReturnValue({ data: [], isLoading: false });
  mocks.receivedQuery.mockReturnValue({ data: [], isLoading: false });
  mocks.ride.mockResolvedValue(undefined);
  mocks.received.mockResolvedValue(undefined);
});
function dateInput() {
  return screen.getByLabelText("Data") as HTMLInputElement;
}
describe("page date and competence regressions", () => {
  it.each(["2024-02-29", "2025-01-31", "2025-02-28", "2025-12-31", "2026-01-01"])(
    "rides derive competence from selected %s",
    async (date) => {
      render(<RidesPage />);
      fireEvent.change(dateInput(), { target: { value: date } });
      expect(mocks.rideQuery).toHaveBeenLastCalledWith(date.slice(0, 7) + "-01", true);
      fireEvent.click(
        screen.getByRole("button", { name: /Synthetic passenger Registrar/ }),
      );
      await waitFor(() =>
        expect(mocks.ride).toHaveBeenCalledWith({ passengerId: "P", rideDate: date }),
      );
    },
  );
  it("empty and future ride dates cannot submit or trigger a monthly query", async () => {
    render(<RidesPage />);
    fireEvent.change(dateInput(), { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toContain("data válida");
    expect(mocks.rideQuery.mock.lastCall?.[1]).toBe(false);
    fireEvent.change(dateInput(), { target: { value: "9999-01-01" } });
    expect(screen.getByRole("alert").textContent).toContain("data futura");
    fireEvent.click(
      screen.getByRole("button", { name: /Synthetic passenger Registrar/ }),
    );
    await waitFor(() => expect(mocks.ride).not.toHaveBeenCalled());
  });
  it("compensation lists and keeps the selected retroactive competence after submit", async () => {
    render(<CompensationsPage />);
    fireEvent.change(dateInput(), { target: { value: "2024-02-29" } });
    expect(mocks.receivedQuery).toHaveBeenLastCalledWith("2024-02-01", true);
    fireEvent.change(screen.getByLabelText("Passageiro"), { target: { value: "P" } });
    fireEvent.change(screen.getByLabelText("Valor a abater"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar carona recebida" }));
    await waitFor(() =>
      expect(mocks.received).toHaveBeenCalledWith({
        passengerId: "P",
        receivedDate: "2024-02-29",
        amount: 10,
      }),
    );
    expect(dateInput().value).toBe("2024-02-29");
  });
  it("compensation blocks future date even without native max validation", async () => {
    render(<CompensationsPage />);
    dateInput().removeAttribute("max");
    fireEvent.change(dateInput(), { target: { value: "9999-01-01" } });
    fireEvent.change(screen.getByLabelText("Passageiro"), { target: { value: "P" } });
    fireEvent.change(screen.getByLabelText("Valor a abater"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar carona recebida" }));
    await screen.findByText("Não é possível registrar uma data futura.");
    expect(mocks.received).not.toHaveBeenCalled();
  });
});
