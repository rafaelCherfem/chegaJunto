import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/utils/currency";
import { amountToInput, parseAmountToCents, typeAmount } from "@/utils/paymentAmount";

interface RegisterPaymentFormProps {
  /** O que ainda falta receber, em centavos: o teto do valor. */
  outstandingCents: number;
  /** Algo está em andamento ou os dados estão sendo recarregados. */
  disabled: boolean;
  /** Registra o pagamento. Devolve true quando gravou; o erro aparece no próprio sheet. */
  onRegister: (amount: number) => Promise<boolean>;
}

const TOO_MANY_DECIMALS = "Use no máximo duas casas decimais.";

export function RegisterPaymentForm({ outstandingCents, disabled, onRegister }: RegisterPaymentFormProps) {
  const inputId = useId();
  const noteId = `${inputId}-note`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Trava síncrona: dois cliques no mesmo instante não registram duas vezes.
  const submittingRef = useRef(false);
  const [text, setText] = useState("");
  const [typingHint, setTypingHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const cents = parseAmountToCents(text);
  const remaining = formatCurrency(outstandingCents / 100);
  let problem: string | null = null;
  if (cents !== null && cents <= 0) problem = "Informe um valor maior que zero.";
  else if (cents !== null && cents > outstandingCents) {
    problem = `O valor é maior que o que falta (${remaining}).`;
  }
  const message = problem ?? typingHint;
  const canSubmit = cents !== null && problem === null && !disabled && !submitting;

  function handleChange(next: string) {
    const result = typeAmount(text, next);
    setTypingHint(result.rejected ? TOO_MANY_DECIMALS : null);
    setText(result.text);
    setDone(null);
  }

  function handleFocus() {
    // A máscara de moeda só vale fora do campo: ao editar volta para o número puro.
    const parsed = parseAmountToCents(text);
    if (parsed !== null && text.includes("R$")) setText(amountToInput(parsed));
    // O teclado ainda está subindo: espera um pouco para o campo não ficar escondido atrás dele.
    window.setTimeout(() => inputRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300);
  }

  function handleBlur() {
    setTypingHint(null);
    const parsed = parseAmountToCents(text);
    if (parsed !== null) setText(formatCurrency(parsed / 100));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || !canSubmit || cents === null) return;
    submittingRef.current = true;
    setSubmitting(true);
    setDone(null);
    try {
      const ok = await onRegister(cents / 100);
      if (ok) {
        setText("");
        setDone(`Pagamento de ${formatCurrency(cents / 100)} registrado.`);
        inputRef.current?.blur();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="sheet__payment" onSubmit={handleSubmit} noValidate>
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={inputId}>Registrar pagamento</Label>
        <span className="text-sm font-semibold tabular-nums">Falta {remaining}</span>
      </div>
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        placeholder="0,00"
        className="mt-1.5"
        value={text}
        readOnly={submitting}
        aria-invalid={problem !== null}
        aria-describedby={noteId}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <p
        key={message ? "alert" : "status"}
        id={noteId}
        role={message ? "alert" : "status"}
        className={message ? "mt-1.5 text-sm text-destructive" : "mt-1.5 text-sm text-muted-foreground"}
      >
        {message ?? done}
      </p>
      <Button
        type="submit"
        variant="secondary"
        className="mt-2 w-full"
        disabled={!canSubmit}
        aria-busy={submitting}
      >
        {submitting ? "Registrando…" : "Registrar pagamento"}
      </Button>
    </form>
  );
}
