import { toCents } from "@/utils/money";

// Valor digitado no campo de pagamento. Tudo em texto até virar centavos inteiros:
// nenhum float no caminho.

// Digitação aceita: dígitos e, no máximo, um separador (vírgula ou ponto) com até 2 casas.
const TYPING = /^\d*(?:[.,]\d{0,2})?$/;

export interface TypingResult {
  text: string;
  /** A digitação foi recusada (mais de duas casas, letra, segundo separador...). */
  rejected: boolean;
}

/** Aceita a nova digitação ou mantém a anterior. Colar com mais de 2 casas é recusado inteiro. */
export function typeAmount(previous: string, next: string): TypingResult {
  if (TYPING.test(next)) return { text: next, rejected: false };
  return { text: previous, rejected: true };
}

/** Centavos de um texto digitado ("12,5", "12.50") ou mascarado ("R$ 1.234,56"); null se inválido. */
export function parseAmountToCents(text: string): number | null {
  let clean = text.replace(/[R$\s]/g, "");
  if (clean === "") return null;
  // Com vírgula, o ponto é separador de milhar (máscara de moeda); sem vírgula, é decimal.
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  try {
    return toCents(clean);
  } catch {
    return null;
  }
}

/** Texto editável de um valor em centavos: "1234,50". */
export function amountToInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole},${fraction}`;
}
