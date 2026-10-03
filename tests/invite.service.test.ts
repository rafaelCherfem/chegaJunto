import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPassengerInvite,
  redeemPassengerInvite,
  revokePassengerInvite,
} from "@/services/passengerAccounts.service";
import { createSessionScope } from "@/lib/sessionScope";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signal: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
  getCurrentUserId: mocks.user,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue("A");
  mocks.rpc.mockReturnValue({ abortSignal: mocks.signal });
  mocks.signal.mockResolvedValue({ data: "synthetic-id", error: null });
});
describe("real invitation services", () => {
  it.each([
    ["INVITE_INVALID", "Convite inválido."],
    ["INVITE_EXPIRED", "Convite expirado."],
    ["INVITE_REVOKED", "Convite revogado."],
    ["INVITE_USED", "Convite já utilizado."],
    ["ACCOUNT_INCOMPATIBLE", "Esta conta já possui um papel ou vínculo incompatível."],
    ["SESSION_REQUIRED", "Entre na sua conta para usar o convite."],
  ])("maps RPC %s to safe product error", async (message, expected) => {
    mocks.signal.mockResolvedValue({ error: { message } });
    await expect(
      redeemPassengerInvite("a".repeat(64), createSessionScope("A").scope),
    ).rejects.toThrow(expected);
  });
  it("sanitizes unknown server messages including tokens", async () => {
    mocks.signal.mockResolvedValue({ error: { message: "secret " + "a".repeat(64) } });
    await expect(redeemPassengerInvite("a".repeat(64))).rejects.toThrow(
      "Falha temporária. Tente novamente.",
    );
  });
  it("sanitizes rejected network errors too", async () => {
    mocks.signal.mockRejectedValue(new Error("request contained " + "a".repeat(64)));
    await expect(redeemPassengerInvite("a".repeat(64))).rejects.toThrow(
      "Falha temporária. Tente novamente.",
    );
  });
  it("creates cryptographic token through RPC and returns delivery separately from list metadata", async () => {
    const result = await createPassengerInvite("target", createSessionScope("A").scope);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("create_passenger_invite", {
      target_passenger: "target",
      invite_token: result.token,
    });
  });
  it("revokes only through RPC with captured session", async () => {
    const scope = createSessionScope("A").scope;
    await revokePassengerInvite("invite", scope);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_passenger_invite", {
      target_invite: "invite",
    });
    expect(mocks.signal).toHaveBeenCalledWith(scope.signal);
  });
  it("rejects late success under a disposed identity", async () => {
    const session = createSessionScope("A");
    mocks.signal.mockImplementation(async () => {
      session.dispose();
      return { error: null };
    });
    await expect(redeemPassengerInvite("a".repeat(64), session.scope)).rejects.toThrow();
  });
});
