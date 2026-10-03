import { describe, it } from "vitest";

// Executable backlog: TODO cases are reported separately, never claimed as
// passing coverage. Implement assertions against real code in later stages.
describe("future specification — not implemented", () => {
  it.todo("money is computed in integer cents: 0.10 + 0.20 is exactly 30 cents");
  it.todo("positive total means passenger owes responsible; negative reverses debtor");
  it.todo("zero means no obligation and closed/PAGO without a payment event");
  it.todo("PENDENTE becomes PAGO only by integral settlement of its version");
  it.todo("recalculation with identical total preserves payment state");
  it.todo("different nonzero total reopens PENDENTE and preserves settlement history");
  it.todo("removing all entries recalculates an existing charge to zero");
  it.todo("each competence is independent; negative balance does not carry forward");
  it.todo("future dates are rejected; today and past dates are accepted");
  it.todo("today follows America/Sao_Paulo even when the device timezone differs");
  it.todo("invalid calendar dates and noncanonical competences are rejected");
  it.todo("monthly service boundaries include the last day without UTC/local shifts");
  // Mocked Auth/React Query isolation is implemented in session.characterization.
  // The remaining session specification requires real Auth and browser tabs.
  it.todo("real Supabase Auth across two browser tabs never exposes A data to B");
  it.todo("resolved flag permits a new flag but only one active flag per ride");
});
