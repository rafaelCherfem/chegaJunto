import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PassengerRideButton } from "@/components/rides/PassengerRideButton";
import type { Passenger } from "@/types/entities";

const passenger: Passenger = { id: "A", active: true, name: "Ana Souza", defaultDailyRate: 12, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
const props = { passenger, registered: false, registering: false, monthRides: [], deletingId: null, onRegister: vi.fn(), onDeleteRide: vi.fn() };
const registerButton = () => screen.getByRole("button", { name: /^Ana Souza/ });

describe("botão de registrar diária", () => {
  it("pendente registra no toque e mostra avatar neutro", () => {
    const { container } = render(<PassengerRideButton {...props} />);
    fireEvent.click(registerButton());
    expect(props.onRegister).toHaveBeenCalledWith(passenger);
    expect(screen.getByText("AS").className).toBe("avatar");
    expect(container.querySelector(".ride-check-in")).toBeNull();
  });
  it("registrando bloqueia um segundo toque", () => {
    render(<PassengerRideButton {...props} registering />);
    expect(registerButton()).toHaveProperty("disabled", true);
    expect(registerButton().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Registrando...")).toBeTruthy();
  });
  it("registrado fica travado, com avatar verde e check parado", () => {
    const { container } = render(<PassengerRideButton {...props} registered />);
    expect(registerButton()).toHaveProperty("disabled", true);
    expect(screen.getByText("AS").className).toContain("avatar--done");
    expect(container.querySelector("svg.lucide-check")).not.toBeNull();
    expect(container.querySelector(".ride-check-in, .avatar--pop")).toBeNull();
    expect(screen.getByText("Ana Souza: diária registrada.")).toBeTruthy();
  });
  it("acabou de registrar anima o check e o avatar e avisa quando a animação termina", () => {
    const onEnd = vi.fn();
    const { container } = render(<PassengerRideButton {...props} registered justRegistered onRegisteredAnimationEnd={onEnd} />);
    expect(container.querySelector(".ride-check-in")).not.toBeNull();
    expect(screen.getByText("AS").className).toContain("avatar--pop");
    fireEvent.animationEnd(screen.getByText("AS"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it("justRegistered sem registro confirmado não anima", () => {
    const { container } = render(<PassengerRideButton {...props} justRegistered />);
    expect(container.querySelector(".ride-check-in, .avatar--pop")).toBeNull();
  });
});
