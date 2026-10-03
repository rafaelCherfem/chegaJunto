import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { InviteRedemptionPage } from "@/pages/InviteRedemptionPage";
const mocks = vi.hoisted(() => ({
  listener: undefined as
    | undefined
    | ((event: string, session: { user: { id: string; email: string } } | null) => void),
  signup: vi.fn(),
  redeem: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signUp: mocks.signup,
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("@/services/passengerAccounts.service", () => ({
  redeemPassengerInvite: mocks.redeem,
}));
function login(id: string) {
  mocks.listener?.("SIGNED_IN", { user: { id, email: id + "@example.test" } });
}
function Home() {
  const { user } = useAuth();
  return <div>Home {user?.id}</div>;
}
async function signup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/convite/synthetic"]}>
        <AuthProvider>
          <Routes>
            <Route path="/convite/:code" element={<InviteRedemptionPage />} />
            <Route path="/" element={<Home />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("E-mail"), {
    target: { value: "A@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByText("Criar conta"));
}
beforeEach(() => {
  mocks.signup.mockReset();
  mocks.redeem.mockReset().mockResolvedValue(undefined);
  mocks.signup.mockImplementation(async () => {
    login("A");
    return { data: { session: { user: { id: "A" } } }, error: null };
  });
});
describe("invite signup continuation across Auth boundary", () => {
  it("preserves legitimate signup/redemption despite private tree remount", async () => {
    await signup();
    await screen.findByText("Home A");
    expect(mocks.redeem).toHaveBeenCalledWith(
      "synthetic",
      expect.objectContaining({ userId: "A" }),
    );
  });
  it("does not redeem the signup invitation under a different identity", async () => {
    mocks.signup.mockImplementation(async () => {
      login("B");
      return { data: { session: { user: { id: "A" } } }, error: null };
    });
    await signup();
    await waitFor(() => expect(mocks.signup).toHaveBeenCalledOnce());
    await screen.findByText("B@example.test");
    expect(mocks.redeem).not.toHaveBeenCalled();
    expect(screen.queryByText(/Home/)).toBeNull();
  });
  it("late redemption cannot navigate the next identity", async () => {
    let complete!: () => void;
    mocks.redeem.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    await signup();
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledOnce());
    act(() => login("B"));
    await screen.findByText("B@example.test");
    await act(async () => {
      complete();
    });
    expect(screen.queryByText(/Home/)).toBeNull();
  });
});
