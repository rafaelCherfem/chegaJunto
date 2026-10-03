import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { PassengerInvitePanel } from "@/components/passengers/PassengerInvitePanel";
import { InviteRedemptionPage } from "@/pages/InviteRedemptionPage";
const mocks = vi.hoisted(() => ({
  listener: undefined as
    | undefined
    | ((event: string, session: { user: { id: string; email: string } } | null) => void),
  signup: vi.fn(),
  redeem: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
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
  listPassengerInvites: mocks.list,
  createPassengerInvite: mocks.create,
  revokePassengerInvite: mocks.revoke,
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
      <MemoryRouter
        initialEntries={[
          "/convite/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ]}
      >
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
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

async function ownerPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.list.mockImplementation(async (_id, scope) => [
    {
      id: scope.userId + "-invite",
      passengerId: "target",
      used: false,
      createdAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-08T00:00:00Z",
      usedAt: null,
      revokedAt: null,
    },
  ]);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <PassengerInvitePanel passengerId="target" />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  act(() => login("A"));
  await screen.findByText(/Pendente ·/);
  return client;
}
describe("owner invitation mutations across real Auth boundary", () => {
  it("late creation never delivers A token or cache into B", async () => {
    let complete!: (result: { id: string; token: string }) => void;
    mocks.create.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const client = await ownerPanel();
    fireEvent.click(screen.getByText("Gerar novo convite"));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    act(() => login("B"));
    await screen.findByText(/Pendente ·/);
    await act(async () => {
      complete({ id: "A-invite", token: "a".repeat(64) });
    });
    expect(screen.queryByText("Copiar link")).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => query.queryKey[1] === "B"),
    ).toBe(true);
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("A-invite");
  });
  it("late revocation from A does not invalidate B invitation cache", async () => {
    let complete!: () => void;
    mocks.revoke.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    await ownerPanel();
    fireEvent.click(screen.getByText("Revogar"));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalled());
    act(() => login("B"));
    await screen.findByText(/Pendente ·/);
    const callsBefore = mocks.list.mock.calls.filter(
      (call) => call[1].userId === "B",
    ).length;
    await act(async () => {
      complete();
    });
    expect(mocks.list.mock.calls.filter((call) => call[1].userId === "B")).toHaveLength(
      callsBefore,
    );
  });
});
