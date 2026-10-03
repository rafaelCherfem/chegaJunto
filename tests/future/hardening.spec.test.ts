import { describe, it } from "vitest";

// Executable backlog: TODO cases are reported separately, never claimed as
// passing coverage. Implement assertions against real code in later stages.
describe("future specification — not implemented", () => {
  // Eight financial specifications are now exercised in financial.*, monthlyTotals,
  // 0008_financial_integrity pgTAP and the real PostgreSQL concurrency script.
  // The four date specifications are implemented in date.integrity, date.services,
  // date.pages and 0007_date_integrity pgTAP; they are no longer future TODOs.
  // Mocked Auth/React Query isolation is implemented in session.characterization.
  // The remaining session specification requires real Auth and browser tabs.
  it.todo("real Supabase Auth across two browser tabs never exposes A data to B");
  it.todo("resolved flag permits a new flag but only one active flag per ride");
});
