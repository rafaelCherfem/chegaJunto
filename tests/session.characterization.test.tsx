import { useLayoutEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { useGenerateReceipt } from "@/hooks/useReceipt";
import { useMyPassengerAccount } from "@/hooks/usePassengerAccount";
import { usePassengers, usePassenger } from "@/hooks/usePassengers";
import { useRidesByMonth, usePassengerRides, useCreateRide } from "@/hooks/useRides";
import { useReceivedRidesByMonth } from "@/hooks/useReceivedRides";
import { useMonthlyCharges } from "@/hooks/useMonthlyCharges";
import { usePassengerInvites } from "@/hooks/usePassengerInvites";
import { useUnresolvedFlags } from "@/hooks/useRideFlags";
import { RoleRouter } from "@/routes/RoleRouter";
import { privateQueryKeys } from "@/lib/privateQueryKeys";
import type { SessionScope } from "@/lib/sessionScope";
const mocks = vi.hoisted(() => ({
  listener: undefined as
    undefined | ((event: string, session: { user: { id: string } } | null) => void),
  session: vi.fn(),
  account: vi.fn(),
  access: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  pdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.session,
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("@/services/passengerAccounts.service", () => ({
  getMyPassengerAccount: mocks.account,
  listPassengerInvites: mocks.list,
}));
vi.mock("@/services/accountAccess.service", () => ({ getMyAccountAccess: mocks.access }));
vi.mock("@/services/passengers.service", () => ({
  listPassengers: mocks.list,
  getPassenger: mocks.list,
}));
vi.mock("@/services/rides.service", () => ({
  listRidesByMonth: mocks.list,
  createRide: mocks.create,
}));
vi.mock("@/services/receivedRides.service", () => ({
  listReceivedRidesByMonth: mocks.list,
}));
vi.mock("@/services/monthlyCharges.service", () => ({ listMonthlyCharges: mocks.list }));
vi.mock("@/services/rideFlags.service", () => ({ listUnresolvedFlags: mocks.list }));
vi.mock("@/services/auth.service", () => ({ signOut: vi.fn() }));
vi.mock("@/pages/PassengerPortalPage", () => ({
  PassengerPortalPage: ({ passengerId }: { passengerId: string }) => (
    <div>Portal {passengerId}</div>
  ),
}));
vi.mock("@/services/pdf.service", () => ({ generateMonthlyReceipt: mocks.pdf }));
vi.mock("@/utils/downloadFile", () => ({ downloadFile: mocks.download }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let client: QueryClient;
let observations: Array<{ user: string | null; passenger: string | undefined }>;
function Harness({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
function Probe() {
  const { user } = useAuth();
  const account = useMyPassengerAccount();
  const [local] = useState(user?.id);
  useLayoutEffect(() => {
    observations.push({ user: user?.id ?? null, passenger: account.data?.passengerId });
  });
  return (
    <div>
      {user?.id ?? "null"}:{account.data?.passengerId ?? "empty"}:local-{local}
    </div>
  );
}
function event(id: string | null, kind = id ? "SIGNED_IN" : "SIGNED_OUT") {
  act(() => mocks.listener?.(kind, id ? { user: { id } } : null));
}
async function loadA() {
  render(<Probe />, { wrapper: Harness });
  await screen.findByText("A:passenger-A:local-A");
}
function assertNoLeak() {
  expect(
    observations
      .filter((item) => item.user === "B")
      .every((item) => item.passenger !== "passenger-A"),
  ).toBe(true);
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => query.queryKey[1] !== "A"),
  ).toBe(true);
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  observations = [];
  mocks.session
    .mockReset()
    .mockResolvedValue({ data: { session: { user: { id: "A" } } } });
  mocks.account.mockReset().mockImplementation(async (scope: SessionScope) => ({
    passengerId: "passenger-" + scope.userId,
  }));
  mocks.access
    .mockReset()
    .mockImplementation(async (scope: SessionScope) =>
      scope.userId === "A"
        ? { role: "responsible" }
        : { role: "passenger", passengerId: "passenger-B" },
    );
  mocks.list.mockReset().mockImplementation(async (...args: unknown[]) => ({
    owner: (args.at(-1) as SessionScope).userId,
  }));
  mocks.create.mockReset();
  mocks.pdf.mockReset();
  mocks.download.mockReset();
});
describe("session regression — actual Auth events and React Query", () => {
  it("removes private A data on logout to null", async () => {
    await loadA();
    event(null);
    await screen.findByText("null:empty:local-");
    expect(screen.queryByText(/passenger-A/)).toBeNull();
    expect(
      client.getQueryData(privateQueryKeys.resource("A", ["myPassengerAccount"])),
    ).toBeUndefined();
  });
  it("A logout B performs a new lookup and never renders A under B", async () => {
    await loadA();
    event(null);
    event("B");
    await screen.findByText("B:passenger-B:local-B");
    assertNoLeak();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });
  it("direct A to B discards cache and local React state", async () => {
    await loadA();
    event("B");
    await screen.findByText("B:passenger-B:local-B");
    assertNoLeak();
  });
  it("cancels A request and ignores a late response even when the service ignores abort", async () => {
    const late = deferred<{ passengerId: string }>();
    mocks.account.mockImplementation((scope: SessionScope) =>
      scope.userId === "A"
        ? late.promise
        : Promise.resolve({ passengerId: "passenger-B" }),
    );
    render(<Probe />, { wrapper: Harness });
    await waitFor(() => expect(mocks.account).toHaveBeenCalledTimes(1));
    const scope = mocks.account.mock.calls[0]?.[0] as SessionScope;
    event("B");
    await screen.findByText("B:passenger-B:local-B");
    expect(scope.signal.aborted).toBe(true);
    await act(async () => {
      late.resolve({ passengerId: "passenger-A" });
      await late.promise;
    });
    assertNoLeak();
    expect(screen.queryByText(/passenger-A/)).toBeNull();
  });
  it.each(["passenger", "unlinked", "error"])(
    "B role %s never inherits A responsibility, including loading",
    async (role) => {
      const late = deferred<
        { role: "passenger"; passengerId: string } | { role: "unlinked" }
      >();
      mocks.access.mockImplementation((scope: SessionScope) =>
        scope.userId === "A"
          ? Promise.resolve({ role: "responsible" })
          : role === "error"
            ? Promise.reject(new Error("B failure"))
            : late.promise,
      );
      render(
        <MemoryRouter>
          <Routes>
            <Route element={<RoleRouter />}>
              <Route path="/" element={<div>Admin A</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
        { wrapper: Harness },
      );
      await screen.findByText("Admin A");
      event("B");
      expect(screen.queryByText("Admin A")).toBeNull();
      if (role === "error") await screen.findByRole("alert");
      else {
        await screen.findByText("Carregando acesso...");
        expect(screen.queryByText("Admin A")).toBeNull();
        await act(async () => {
          late.resolve(
            role === "passenger"
              ? { role: "passenger", passengerId: "passenger-B" }
              : { role: "unlinked" },
          );
        });
        await screen.findByText(
          role === "passenger"
            ? "Portal passenger-B"
            : "Sua conta ainda não possui acesso associado.",
        );
      }
      expect(screen.queryByText("Admin A")).toBeNull();
    },
  );
  it("a new login as A legitimately reloads A", async () => {
    await loadA();
    event(null);
    await screen.findByText("null:empty:local-");
    event("A");
    await screen.findByText("A:passenger-A:local-A");
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });
  it("same-identity token refresh preserves cache", async () => {
    await loadA();
    const clear = vi.spyOn(client, "clear");
    event("A", "TOKEN_REFRESHED");
    expect(screen.getByText("A:passenger-A:local-A")).toBeTruthy();
    expect(clear).not.toHaveBeenCalled();
  });
  it("late initial getSession cannot override newer B auth event", async () => {
    const initial = deferred<{ data: { session: { user: { id: string } } } }>();
    mocks.session.mockReturnValue(initial.promise);
    render(<Probe />, { wrapper: Harness });
    event("B");
    await screen.findByText("B:passenger-B:local-B");
    await act(async () => {
      initial.resolve({ data: { session: { user: { id: "A" } } } });
    });
    expect(screen.getByText("B:passenger-B:local-B")).toBeTruthy();
    assertNoLeak();
  });
  it("all private resource hooks scope keys and reload for B", async () => {
    function Resources() {
      const { user } = useAuth();
      const queries = [
        usePassengers(),
        usePassenger("P"),
        useRidesByMonth("2025-01-01"),
        usePassengerRides("P", "2025-01-01", true),
        useReceivedRidesByMonth("2025-01-01"),
        useMonthlyCharges("2025-01-01"),
        usePassengerInvites("P", true),
        useUnresolvedFlags(),
      ];
      return (
        <div>
          {user?.id}:{queries.filter((query) => query.isSuccess).length}
        </div>
      );
    }
    render(<Resources />, { wrapper: Harness });
    await screen.findByText("A:8");
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((q) => q.queryKey[0] === "private" && q.queryKey[1] === "A"),
    ).toBe(true);
    event("B");
    await screen.findByText("B:8");
    assertNoLeak();
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((q) => (q.state.data as { owner: string }).owner === "B"),
    ).toBe(true);
  });
  it("late A mutation cannot invalidate B or invoke success callbacks", async () => {
    const late = deferred<{ id: string }>();
    mocks.create.mockReturnValue(late.promise);
    const success = vi.fn();
    function MutationProbe() {
      const { user } = useAuth();
      const mutation = useCreateRide();
      return (
        <button
          onClick={() =>
            mutation.mutate(
              { passengerId: "P", rideDate: "2025-01-01" },
              { onSuccess: success },
            )
          }
        >
          Mutate {user?.id}
        </button>
      );
    }
    render(<MutationProbe />, { wrapper: Harness });
    fireEvent.click(await screen.findByText("Mutate A"));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    event("B");
    await screen.findByText("Mutate B");
    await act(async () => {
      late.resolve({ id: "ride-A" });
      await late.promise;
    });
    expect((mocks.create.mock.calls[0]?.[1] as SessionScope).signal.aborted).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("late response from the old A session cannot replace a new login as A", async () => {
    const late = deferred<{ passengerId: string }>();
    mocks.account
      .mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce({ passengerId: "fresh-A" });
    render(<Probe />, { wrapper: Harness });
    await waitFor(() => expect(mocks.account).toHaveBeenCalledTimes(1));
    event(null);
    event("A");
    await screen.findByText("A:fresh-A:local-A");
    await act(async () => {
      late.resolve({ passengerId: "old-A" });
    });
    expect(screen.queryByText(/old-A/)).toBeNull();
    expect(
      client.getQueryData(privateQueryKeys.resource("A", ["myPassengerAccount"])),
    ).toEqual({ passengerId: "fresh-A" });
  });
  it("current mutation invalidates only its own user's resource prefix", async () => {
    mocks.create.mockResolvedValue({ id: "ride-A" });
    function MutationProbe() {
      const mutation = useCreateRide();
      return (
        <button
          onClick={() => mutation.mutate({ passengerId: "P", rideDate: "2025-01-01" })}
        >
          Create
        </button>
      );
    }
    render(<MutationProbe />, { wrapper: Harness });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await screen.findByText("Create"));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["private", "A", "rides"] }),
    );
  });
  it("a PDF finishing after session change does not download A data", async () => {
    const late = deferred<Uint8Array>();
    mocks.pdf.mockReturnValue(late.promise);
    function ReceiptProbe() {
      const { user } = useAuth();
      const mutation = useGenerateReceipt();
      return (
        <button
          onClick={() =>
            mutation.mutate({
              passenger: {
                id: "P",
                name: "A private",
                defaultDailyRate: 10,
                active: true,
                createdAt: "",
                updatedAt: "",
              },
              charge: {
                id: "C",
                passengerId: "P",
                referenceMonth: "2025-01-01",
                totalAmount: 10,
                paid: true,
                paidAmount: 10,
                paidAt: "",
                createdAt: "",
              },
              referenceMonth: "2025-01-01",
            })
          }
        >
          Receipt {user?.id}
        </button>
      );
    }
    render(<ReceiptProbe />, { wrapper: Harness });
    fireEvent.click(await screen.findByText("Receipt A"));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledOnce());
    event("B");
    await screen.findByText("Receipt B");
    await act(async () => {
      late.resolve(new Uint8Array([1]));
    });
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
