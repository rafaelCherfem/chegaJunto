import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unit/UI tests must never reach Supabase or any other network endpoint.
vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    throw new Error("Network disabled in unit/UI tests. Mock the service.");
  }),
);
vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => {
  throw new Error("XMLHttpRequest disabled in unit/UI tests.");
});
afterEach(() => cleanup());
