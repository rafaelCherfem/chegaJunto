import { describe, expect, it, vi } from "vitest";
import { calculateMonthlyCharges } from "@/services/monthlyCharges.service";
import { createSessionScope } from "@/lib/sessionScope";
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
describe("transactional closing session guard",()=>{
 it("does not start RPC after the session changes",async()=>{
  const lease=createSessionScope("A");lease.dispose();
  await expect(calculateMonthlyCharges("2025-01-01",lease.scope)).rejects.toThrow("sessão mudou");
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
