import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoleRouter } from "@/routes/RoleRouter";
const mocks = vi.hoisted(() => ({ access: vi.fn(), refetch: vi.fn(), logout: vi.fn() }));
vi.mock("@/hooks/useAccountAccess", () => ({ useAccountAccess: mocks.access }));
vi.mock("@/services/auth.service", () => ({ signOut: mocks.logout }));
vi.mock("@/pages/PassengerPortalPage", () => ({
  PassengerPortalPage: ({ passengerId }: { passengerId: string }) => (
    <div>Portal {passengerId}</div>
  ),
}));
function show() {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<RoleRouter />}>
          <Route path="/" element={<div>Administração</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mocks.access.mockReset();
  mocks.refetch.mockReset();
  mocks.logout.mockReset();
});
describe("explicit account access routing", () => {
  it("recognizes explicitly granted responsibility", () => {
    mocks.access.mockReturnValue({ data: { role: "responsible" } });
    show();
    expect(screen.getByText("Administração")).toBeTruthy();
  });
  it("routes a linked passenger to only their portal", () => {
    mocks.access.mockReturnValue({
      data: { role: "passenger", passengerId: "synthetic-A" },
    });
    show();
    expect(screen.getByText("Portal synthetic-A")).toBeTruthy();
    expect(screen.queryByText("Administração")).toBeNull();
  });
  it("never promotes an unlinked account", () => {
    mocks.access.mockReturnValue({ data: { role: "unlinked" } });
    show();
    expect(screen.getByText("Sua conta ainda não possui acesso associado.")).toBeTruthy();
    expect(screen.queryByText("Administração")).toBeNull();
    fireEvent.click(screen.getByText("Sair"));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
  it("waits while loading", () => {
    mocks.access.mockReturnValue({ isLoading: true });
    show();
    expect(screen.getByText("Carregando acesso...")).toBeTruthy();
    expect(screen.queryByText("Administração")).toBeNull();
  });
  it("fails closed on error even if stale responsible data exists", () => {
    mocks.access.mockReturnValue({
      data: { role: "responsible" },
      isError: true,
      refetch: mocks.refetch,
    });
    show();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Administração")).toBeNull();
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it("does not treat missing data as a responsible account", () => {
    mocks.access.mockReturnValue({ refetch: mocks.refetch });
    show();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Administração")).toBeNull();
  });
});
