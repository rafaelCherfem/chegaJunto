import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMyAccountAccess } from "@/services/accountAccess.service";
const mocks = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.user,
  supabase: { from: mocks.from },
}));
beforeEach(() => {
  mocks.from.mockReset();
  mocks.user.mockReset();
  mocks.user.mockResolvedValue("synthetic-user");
});
function respond(owner: unknown, passenger: unknown, error: unknown = null) {
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (column: string, id: string) => {
        expect(column).toBe("user_id");
        expect(id).toBe("synthetic-user");
        return {
          abortSignal() {
            return this;
          },
          maybeSingle: async () => ({
            data: table === "responsible_accounts" ? owner : passenger,
            error,
          }),
        };
      },
    }),
  }));
}
describe("explicit access service", () => {
  it("returns responsible only with an explicit row", async () => {
    respond({ user_id: "synthetic-user" }, null);
    expect(await getMyAccountAccess()).toEqual({ role: "responsible" });
  });
  it("recognizes passenger association", async () => {
    respond(null, { passenger_id: "A" });
    expect(await getMyAccountAccess()).toEqual({ role: "passenger", passengerId: "A" });
  });
  it("returns unlinked when neither row exists", async () => {
    respond(null, null);
    expect(await getMyAccountAccess()).toEqual({ role: "unlinked" });
  });
  it("rejects conflicting roles", async () => {
    respond({ user_id: "synthetic-user" }, { passenger_id: "A" });
    await expect(getMyAccountAccess()).rejects.toThrow("incompatíveis");
  });
  it("does not promote on query failure", async () => {
    respond(null, null, { message: "failure" });
    await expect(getMyAccountAccess()).rejects.toThrow("verificar");
  });
  it("does not query when authentication fails", async () => {
    mocks.user.mockRejectedValue(new Error("Unauthenticated"));
    await expect(getMyAccountAccess()).rejects.toThrow("Unauthenticated");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
