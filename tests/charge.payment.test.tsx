import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChargeSheet } from "@/components/charges/ChargeSheet";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

function sheetProps(overrides: Partial<Parameters<typeof ChargeSheet>[0]> = {}) {
  return {
    passengerName: "Carlos Eduardo Lima",
    monthLabel: "outubro de 2026",
    amount: 256,
    status: "closed" as const,
    rideAmount: 256,
    compensationAmount: 0,
    paid: false,
    paidAmount: 231,
    canUnmarkPaid: false,
    toggling: false,
    generatingReceipt: false,
    onMarkPaid: vi.fn(),
    onUnmarkPaid: vi.fn(),
    onGenerateReceipt: vi.fn(),
    onRegisterPayment: vi.fn().mockResolvedValue(true),
    open: true,
    onOpenChange: vi.fn(),
    ...overrides,
  };
}

// Falta R$ 25,00 (256 - 231).
const field = () => screen.getByLabelText("Registrar pagamento") as HTMLInputElement;
// Pelo tipo, porque durante o envio o nome do botão vira "Registrando…".
const submit = () => field().closest("form")!.querySelector("button[type=submit]") as HTMLButtonElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("free payment form", () => {
  it("shows the ceiling and a decimal keypad, and does not grab focus when the sheet opens", () => {
    render(<ChargeSheet {...sheetProps()} />);
    expect(screen.getByText(/^Falta R\$\s25,00$/)).toBeTruthy();
    expect(field().getAttribute("inputmode")).toBe("decimal");
    expect(document.activeElement).not.toBe(field());
  });

  it("is not offered without the handler, when settled, for refunds or for an outdated total", () => {
    const { rerender } = render(<ChargeSheet {...sheetProps({ onRegisterPayment: undefined })} />);
    expect(screen.queryByLabelText("Registrar pagamento")).toBeNull();
    rerender(<ChargeSheet {...sheetProps({ paid: true, paidAmount: 256 })} />);
    expect(screen.queryByLabelText("Registrar pagamento")).toBeNull();
    rerender(<ChargeSheet {...sheetProps({ amount: -3, paidAmount: 0 })} />);
    expect(screen.queryByLabelText("Registrar pagamento")).toBeNull();
    rerender(<ChargeSheet {...sheetProps({ status: "outdated", computedAmount: 300 })} />);
    expect(screen.queryByLabelText("Registrar pagamento")).toBeNull();
  });

  it("accepts a comma and sends the exact cents", async () => {
    const props = sheetProps();
    render(<ChargeSheet {...props} />);
    type("12,34");
    fireEvent.click(submit());
    await waitFor(() => expect(props.onRegisterPayment).toHaveBeenCalledTimes(1));
    expect(props.onRegisterPayment).toHaveBeenCalledWith(12.34);
  });

  it("accepts a dot as the decimal separator", async () => {
    const props = sheetProps();
    render(<ChargeSheet {...props} />);
    type("12.5");
    fireEvent.click(submit());
    await waitFor(() => expect(props.onRegisterPayment).toHaveBeenCalledWith(12.5));
  });

  it("refuses a third decimal right away and says why", () => {
    render(<ChargeSheet {...sheetProps()} />);
    type("1,23");
    type("1,234");
    expect(field().value).toBe("1,23");
    expect(screen.getByRole("alert").textContent).toBe("Use no máximo duas casas decimais.");
  });

  it("refuses a pasted value with more than two decimals instead of cutting it", () => {
    render(<ChargeSheet {...sheetProps()} />);
    type("10,999");
    expect(field().value).toBe("");
  });

  it("applies the currency mask only when the field loses focus, and goes back to plain text on focus", async () => {
    const props = sheetProps();
    render(<ChargeSheet {...props} />);
    fireEvent.focus(field());
    type("20");
    expect(field().value).toBe("20");
    fireEvent.blur(field());
    expect(field().value).toMatch(/^R\$\s20,00$/);
    fireEvent.focus(field());
    expect(field().value).toBe("20,00");
    fireEvent.blur(field());
    fireEvent.click(submit());
    await waitFor(() => expect(props.onRegisterPayment).toHaveBeenCalledWith(20));
  });

  it("refuses zero", () => {
    render(<ChargeSheet {...sheetProps()} />);
    type("0");
    expect(screen.getByRole("alert").textContent).toBe("Informe um valor maior que zero.");
    expect(submit().disabled).toBe(true);
    type("0,00");
    expect(submit().disabled).toBe(true);
  });

  it("warns before sending when the value is above what is missing, and allows exactly what is missing", () => {
    render(<ChargeSheet {...sheetProps()} />);
    type("25,01");
    expect(screen.getByRole("alert").textContent).toMatch(/O valor é maior que o que falta \(R\$\s25,00\)\./);
    expect(submit().disabled).toBe(true);
    type("25");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it("stays disabled while the data reloads or another action runs", () => {
    render(<ChargeSheet {...sheetProps({ toggling: true })} />);
    type("10");
    expect(submit().disabled).toBe(true);
  });

  it("shows the loading state, locks the field and sends only once, even if submitted twice", async () => {
    let finish!: (ok: boolean) => void;
    const props = sheetProps({
      onRegisterPayment: vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve))),
    });
    render(<ChargeSheet {...props} />);
    type("10");
    const form = field().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(props.onRegisterPayment).toHaveBeenCalledTimes(1);
    expect(submit().getAttribute("aria-busy")).toBe("true");
    expect(submit().textContent).toBe("Registrando…");
    expect(field().readOnly).toBe(true);
    await act(async () => finish(true));
    expect(field().value).toBe("");
    expect(screen.getByRole("status").textContent).toMatch(/Pagamento de R\$\s10,00 registrado\./);
    expect(submit().textContent).toBe("Registrar pagamento");
  });

  it("keeps what was typed when the payment was not recorded", async () => {
    const props = sheetProps({ onRegisterPayment: vi.fn().mockResolvedValue(false) });
    render(<ChargeSheet {...props} />);
    type("10");
    fireEvent.click(submit());
    await waitFor(() => expect(props.onRegisterPayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit().getAttribute("aria-busy")).toBe("false"));
    expect(field().value).toBe("10");
  });

  it("scrolls the field into view shortly after focus, so the keyboard does not hide it", () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<ChargeSheet {...sheetProps()} />);
    fireEvent.focus(field());
    expect(scroll).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("puts the form above the receipt button, in the top of the sheet", () => {
    render(<ChargeSheet {...sheetProps()} />);
    const receipt = screen.getByText("Gerar comprovante");
    expect(field().compareDocumentPosition(receipt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("payment history in the sheet", () => {
  const payments = [
    { id: "e2", occurredAt: "2026-11-20T15:00:00Z", amount: 30 },
    { id: "e1", occurredAt: "2026-11-03T02:00:00Z", amount: 50.5 },
  ];

  it("lists the payments in force with date (São Paulo) and value", () => {
    render(<ChargeSheet {...sheetProps({ payments, canUnmarkPaid: true })} />);
    const history = screen.getByRole("region", { name: "Pagamentos registrados" });
    const items = within(history).getAllByRole("listitem");
    expect(items[0]!.textContent).toMatch(/20\/11\/2026 · mais recenteR\$\s30,00/);
    // 02:00 UTC do dia 3 ainda é dia 2 em São Paulo.
    expect(items[1]!.textContent).toMatch(/02\/11\/2026R\$\s50,50/);
  });

  it("the undo line names the date of the payment it will undo", () => {
    render(<ChargeSheet {...sheetProps({ payments, canUnmarkPaid: true })} />);
    expect(screen.getByText(/Desfaz o pagamento de 20\/11\/2026: R\$\s30,00/)).toBeTruthy();
  });

  it("shows nothing when there is no payment in force", () => {
    render(<ChargeSheet {...sheetProps({ payments: [], paidAmount: 0 })} />);
    expect(screen.queryByRole("region", { name: "Pagamentos registrados" })).toBeNull();
  });

  it("a refund shows the returned values as positive amounts", () => {
    render(
      <ChargeSheet
        {...sheetProps({
          amount: -10,
          paidAmount: -4,
          payments: [{ id: "d", occurredAt: "2026-11-20T15:00:00Z", amount: -4 }],
          canUnmarkPaid: true,
        })}
      />,
    );
    const history = screen.getByRole("region", { name: "Devoluções feitas" });
    expect(within(history).getByText(/^R\$\s4,00$/)).toBeTruthy();
    expect(screen.getByText(/Desfaz o pagamento de 20\/11\/2026: R\$\s4,00/)).toBeTruthy();
  });
});

describe("errors inside the sheet", () => {
  it("shows the last action error as an alert in the dialog, not behind the overlay", () => {
    render(<ChargeSheet {...sheetProps({ actionError: "A cobrança mudou e a tela foi atualizada." })} />);
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(alert.textContent).toBe("A cobrança mudou e a tela foi atualizada.");
  });

  it("shows no alert when there is no error", () => {
    render(<ChargeSheet {...sheetProps({ actionError: null })} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("keyboard inset", () => {
  function mockViewport(height: number, offsetTop = 0) {
    const viewport = Object.assign(new EventTarget(), { height, offsetTop });
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    return viewport;
  }
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
  });

  it("is 0 without visualViewport", () => {
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0);
  });

  it("is the height the keyboard covers, and 0 again when it closes", () => {
    const viewport = mockViewport(500);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(300);
    act(() => {
      viewport.height = 790;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(0);
  });

  it("ignores a small difference, which is browser bars and not a keyboard", () => {
    mockViewport(740);
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0);
  });

  it("the sheet rises above the keyboard through --kb", () => {
    mockViewport(500);
    render(<ChargeSheet {...sheetProps()} />);
    expect(screen.getByRole("dialog").style.getPropertyValue("--kb")).toBe("300px");
  });
});
