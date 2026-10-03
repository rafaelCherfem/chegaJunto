import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRide, listRidesByMonth } from "@/services/rides.service";
import {
  createReceivedRide,
  listReceivedRidesByMonth,
} from "@/services/receivedRides.service";
import { listMonthlyCharges } from "@/services/monthlyCharges.service";
const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn(), passenger: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getUser,
  supabase: { from: mocks.from },
}));
vi.mock("@/services/passengers.service", () => ({ getPassenger: mocks.passenger }));
const builder = {
  select: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  insert: vi.fn(),
  abortSignal: vi.fn(),
  single: vi.fn(),
  then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T02:00:00Z"));
  for (const method of [
    builder.select,
    builder.gte,
    builder.lt,
    builder.order,
    builder.eq,
    builder.insert,
    builder.abortSignal,
  ])
    method.mockReturnValue(builder);
  mocks.from.mockReturnValue(builder);
  mocks.getUser.mockResolvedValue("owner");
  mocks.passenger.mockResolvedValue({ defaultDailyRate: 10 });
  builder.single.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.useRealTimers());
describe("real services enforce civil dates", () => {
  it.each([listRidesByMonth, listReceivedRidesByMonth])(
    "queries use exact half-open calendar bounds",
    async (list) => {
      for (const [month, end] of [
        ["2026-01-01", "2026-02-01"],
        ["2026-02-01", "2026-03-01"],
        ["2024-02-01", "2024-03-01"],
        ["2026-12-01", "2027-01-01"],
      ]) {
        await list(month!, "P");
        const column = list === listRidesByMonth ? "ride_date" : "received_date";
        expect(builder.gte).toHaveBeenLastCalledWith(column, month);
        expect(builder.lt).toHaveBeenLastCalledWith(column, end);
        expect(builder.eq).toHaveBeenCalledWith("passenger_id", "P");
      }
    },
  );
  it.each([listRidesByMonth, listReceivedRidesByMonth, listMonthlyCharges])(
    "invalid monthly input fails before any query",
    async (list) => {
      await expect(list("2026-02-28")).rejects.toThrow("Competência");
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it.each(["2026-09-30", "2026-09-29", "2024-02-29"])(
    "ride and compensation accept %s verbatim",
    async (date) => {
      await createRide({ passengerId: "P", rideDate: date });
      expect(builder.insert).toHaveBeenLastCalledWith(
        expect.objectContaining({ ride_date: date }),
      );
      await createReceivedRide({ passengerId: "P", receivedDate: date, amount: 10 });
      expect(builder.insert).toHaveBeenLastCalledWith(
        expect.objectContaining({ received_date: date }),
      );
    },
  );
  it.each(["2026-10-01", "2026-02-30", "2026-09-30T00:00:00Z"])(
    "invalid/future %s never starts a write",
    async (date) => {
      await expect(createRide({ passengerId: "P", rideDate: date })).rejects.toThrow();
      await expect(
        createReceivedRide({ passengerId: "P", receivedDate: date, amount: 10 }),
      ).rejects.toThrow();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.getUser).not.toHaveBeenCalled();
    },
  );
  it("maps database future rejection even when browser clock allowed the date", async () => {
    builder.single.mockResolvedValue({
      error: { code: "23514", message: "FUTURE_DATE" },
    });
    await expect(
      createRide({ passengerId: "P", rideDate: "2026-09-30" }),
    ).rejects.toThrow("data futura");
    await expect(
      createReceivedRide({ passengerId: "P", receivedDate: "2026-09-30", amount: 10 }),
    ).rejects.toThrow("data futura");
  });
});
