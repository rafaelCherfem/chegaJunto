import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteRedemptionPage } from "@/pages/InviteRedemptionPage";
import { PassengerInvitePanel } from "@/components/passengers/PassengerInvitePanel";
import { createSessionScope } from "@/lib/sessionScope";
import { generateInviteCode } from "@/utils/inviteCode";
import { inviteStatus } from "@/utils/inviteStatus";
import { recalledInvite, rememberInvite } from "@/utils/pendingInvite";
import type { PassengerInvite } from "@/types/entities";
const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  redeem: vi.fn(),
  signup: vi.fn(),
  signin: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/services/auth.service", () => ({
  signUpWithPassword: mocks.signup,
  signInWithPassword: mocks.signin,
  signOut: vi.fn(),
}));
vi.mock("@/services/passengerAccounts.service", () => ({
  redeemPassengerInvite: mocks.redeem,
  listPassengerInvites: mocks.list,
  createPassengerInvite: mocks.create,
  revokePassengerInvite: mocks.revoke,
}));
const token = "a".repeat(64);
const invite: PassengerInvite = {
  id: "invite-1",
  passengerId: "target",
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-08T00:00:00Z",
  usedAt: null,
  revokedAt: null,
};
let current = createSessionScope("A");
function identity(id: string | null) {
  current.dispose();
  current = createSessionScope(id);
  mocks.auth = {
    user: id ? { id, email: id + "@example.test" } : null,
    loading: false,
    scope: current.scope,
    getScope: () => current.scope,
  };
}
function page(url = `/convite#token=${token}`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/convite" element={<InviteRedemptionPage />} />
        <Route path="/" element={<p>Vínculo concluído</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function signup() {
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "new@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  identity("A");
  mocks.redeem.mockResolvedValue(undefined);
  mocks.signup.mockResolvedValue(false);
  mocks.signin.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([invite]);
  mocks.create.mockResolvedValue({ id: "invite-2", token });
  mocks.revoke.mockResolvedValue(undefined);
});
describe("invitation lifecycle", () => {
  it("uses 256-bit URL-safe crypto randomness without Math.random", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Forbidden");
    });
    const first = generateInviteCode(),
      second = generateInviteCode();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    random.mockRestore();
  });
  it.each([
    [{ ...invite, used: true }, "Usado"],
    [{ ...invite, revokedAt: "2026-01-02T00:00:00Z" }, "Revogado"],
    [{ ...invite, expiresAt: "2000-01-01T00:00:00Z" }, "Expirado"],
    [invite, "Pendente"],
  ] as const)("derives coherent status %s", (value, status) =>
    expect(inviteStatus(value)).toBe(status),
  );
  it("uses the current invitation when the fragment changes without a full reload", async () => {
    function ChangeInvite() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/convite#token=" + "b".repeat(64))}>
            Trocar link
          </button>
          <InviteRedemptionPage />
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={[`/convite#token=${token}`]}>
        <Routes>
          <Route path="/convite" element={<ChangeInvite />} />
          <Route path="/" element={<p>Vínculo concluído</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Trocar link"));
    fireEvent.click(screen.getByText("Usar convite"));
    await screen.findByText("Vínculo concluído");
    expect(mocks.redeem).toHaveBeenCalledWith(
      "b".repeat(64),
      expect.objectContaining({ userId: "A" }),
    );
  });
  it("existing authenticated account redeems under current scope and clears temporary token", async () => {
    rememberInvite(token);
    page();
    fireEvent.click(screen.getByText("Usar convite"));
    await screen.findByText("Vínculo concluído");
    expect(mocks.redeem).toHaveBeenCalledWith(
      token,
      expect.objectContaining({ userId: "A" }),
    );
    expect(recalledInvite()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it.each([
    "Convite inválido.",
    "Convite expirado.",
    "Convite revogado.",
    "Convite já utilizado.",
    "Esta conta já possui um papel ou vínculo incompatível.",
  ])("distinguishes product error: %s", async (message) => {
    mocks.redeem.mockRejectedValue(new Error(message));
    page();
    fireEvent.click(screen.getByText("Usar convite"));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByText("Vínculo concluído")).toBeNull();
  });
  it("network error allows explicit retry without logging bearer token", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.redeem.mockRejectedValueOnce(new Error("Falha temporária. Tente novamente."));
    page();
    fireEvent.click(screen.getByText("Usar convite"));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Usar convite"));
    await screen.findByText("Vínculo concluído");
    expect(mocks.redeem).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.flat().some((value) => String(value).includes(token))).toBe(
      false,
    );
    log.mockRestore();
  });
  it("does not redeem before confirmed Auth and resumes after redirect without raw token in auth URL", async () => {
    identity(null);
    page();
    await signup();
    await screen.findByText(/confirme seu e-mail/);
    expect(mocks.redeem).not.toHaveBeenCalled();
    expect(recalledInvite()).toBe(token);
    expect(mocks.signup.mock.calls[0]?.[2]).toBe(`${window.location.origin}/convite`);
    cleanup();
    identity("confirmed");
    page("/convite");
    fireEvent.click(screen.getByText("Usar convite"));
    await screen.findByText("Vínculo concluído");
    expect(mocks.redeem).toHaveBeenCalledWith(
      token,
      expect.objectContaining({ userId: "confirmed" }),
    );
  });
  it("offers login for existing accounts without requiring signup", async () => {
    identity(null);
    page();
    fireEvent.click(screen.getByText("Já tenho conta"));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "existing@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByText("Entrar"));
    await waitFor(() => expect(mocks.signin).toHaveBeenCalledOnce());
    expect(mocks.signup).not.toHaveBeenCalled();
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
  it("expired temporary storage is discarded", () => {
    sessionStorage.setItem(
      "rideledger.pendingInvite",
      JSON.stringify({ token, until: Date.now() - 1 }),
    );
    expect(recalledInvite()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("an obsolete redemption cannot navigate the next identity", async () => {
    let resolve!: () => void;
    mocks.redeem.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    page();
    fireEvent.click(screen.getByText("Usar convite"));
    identity("B");
    await act(async () => {
      resolve();
    });
    expect(screen.queryByText("Vínculo concluído")).toBeNull();
  });
  it("lists statuses and revokes via scoped RPC, refreshing owner cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.revoke.mockImplementation(async () => {
      mocks.list.mockResolvedValue([{ ...invite, revokedAt: "2026-01-02T00:00:00Z" }]);
    });
    render(
      <QueryClientProvider client={client}>
        <PassengerInvitePanel passengerId="target" />
      </QueryClientProvider>,
    );
    await screen.findByText(/Pendente ·/);
    fireEvent.click(screen.getByText("Revogar"));
    await screen.findByText(/Revogado ·/);
    expect(mocks.revoke).toHaveBeenCalledWith(
      "invite-1",
      expect.objectContaining({ userId: "A" }),
    );
    expect(screen.queryByText("Revogar")).toBeNull();
  });
  it("delivers a new link once in fragment and never recovers token from listed records", async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PassengerInvitePanel passengerId="target" />
      </QueryClientProvider>,
    );
    await screen.findByText(/Pendente ·/);
    expect(screen.queryByText("Copiar link")).toBeNull();
    fireEvent.click(screen.getByText("Gerar novo convite"));
    fireEvent.click(await screen.findByText("Copiar link"));
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(
        `${window.location.origin}/convite#token=${token}`,
      ),
    );
  });
});
