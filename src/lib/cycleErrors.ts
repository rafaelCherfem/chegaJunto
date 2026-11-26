import { formatCurrency } from "@/utils/currency";
import { formatIsoDatesInText } from "@/utils/date";

// Erros do fechamento por ciclo (migrações 0012 e 0013). O banco manda o token na
// mensagem e o texto em português no HINT.
export type CycleErrorToken =
  | "INVALID_CYCLE_END"
  | "FUTURE_DATE"
  | "CYCLE_OVERLAP"
  | "BEFORE_FIRST_CYCLE"
  | "FINANCIAL_FORBIDDEN";

const ERRORS: Record<CycleErrorToken, { code: string; fallback: string }> = {
  INVALID_CYCLE_END: { code: "23514", fallback: "Escolha uma data de fim válida." },
  FUTURE_DATE: { code: "23514", fallback: "A data de fim não pode ser futura." },
  CYCLE_OVERLAP: {
    code: "23514",
    fallback: "Este período se sobrepõe a um ciclo já fechado.",
  },
  BEFORE_FIRST_CYCLE: {
    code: "23514",
    fallback: "Esta data é anterior ao primeiro fechamento do passageiro.",
  },
  FINANCIAL_FORBIDDEN: {
    code: "42501",
    fallback: "Você não tem permissão para esta operação.",
  },
};

interface PostgrestLikeError {
  code?: string;
  message?: string;
  hint?: string | null;
}

export function cycleErrorToken(error: PostgrestLikeError): CycleErrorToken | null {
  const message = error.message ?? "";
  for (const token of Object.keys(ERRORS) as CycleErrorToken[]) {
    if (error.code === ERRORS[token].code && message.includes(token)) return token;
  }
  return null;
}

/**
 * Traduz um erro do banco para o texto da tela. Devolve null quando o erro não é um dos
 * cinco tokens do ciclo, para quem chama seguir com o seu próprio tratamento.
 * Usa o hint quando vier (datas ISO viram dd/mm/aaaa) e o texto fixo quando não vier.
 */
export function mapCycleError(error: PostgrestLikeError): Error | null {
  const token = cycleErrorToken(error);
  if (!token) return null;
  const hint = typeof error.hint === "string" ? error.hint.trim() : "";
  return new Error(hint ? formatIsoDatesInText(hint) : ERRORS[token].fallback);
}

// register_payment ainda não existe no banco (PGRST202): o front saiu antes da migração 0015.
export const PAYMENT_UNAVAILABLE = "Pagamento livre ainda não está disponível. Tente de novo em instantes.";

// A confirmação da tela ficou velha (o banco respondeu STALE_OBLIGATION, código 40001).
// A tela reconhece este erro para recarregar os dados e avisar.
export class StaleObligationError extends Error {
  constructor() {
    super("A cobrança mudou. Atualize os dados e repita a operação.");
    this.name = "StaleObligationError";
  }
}

// Erros do encerramento do ciclo em aberto e do pagamento de valor livre (migrações 0014 e 0015).
// Ficam à parte de mapCycleError, que continua tratando só os cinco tokens do fechamento por ciclo.
export type PaymentErrorToken =
  | "EXTENSIBLE_CYCLE_OPEN"
  | "INVALID_PAYMENT_AMOUNT"
  | "NO_OBLIGATION"
  | "PAYMENT_EXCEEDS_OUTSTANDING";

const PAYMENT_ERRORS: Record<PaymentErrorToken, string> = {
  EXTENSIBLE_CYCLE_OPEN:
    "Existe um ciclo em aberto. Encerre o ciclo pela tela de cobranças antes de fechar um mês.",
  INVALID_PAYMENT_AMOUNT: "Informe um valor maior que zero, com no máximo duas casas decimais.",
  NO_OBLIGATION: "Não há nada a receber desta cobrança.",
  PAYMENT_EXCEEDS_OUTSTANDING: "O valor é maior que o que falta receber.",
};

export function paymentErrorToken(error: PostgrestLikeError): PaymentErrorToken | null {
  if (error.code !== "23514") return null;
  const message = error.message ?? "";
  for (const token of Object.keys(PAYMENT_ERRORS) as PaymentErrorToken[]) {
    if (message.includes(token)) return token;
  }
  return null;
}

// O banco escreve o valor com ponto ("Falta receber 180.00."); na tela vira "R$ 180,00".
function formatAmountsInText(text: string): string {
  return text.replace(/(\d+)\.(\d{2})(?!\d)/g, (_, whole: string, cents: string) =>
    formatCurrency(Number(`${whole}.${cents}`)),
  );
}

/**
 * Traduz os quatro erros novos. Devolve null para qualquer outro erro.
 * Usa o hint do banco (datas e valores em formato brasileiro) e, sem ele, um texto fixo.
 */
export function mapPaymentError(error: PostgrestLikeError): Error | null {
  const token = paymentErrorToken(error);
  if (!token) return null;
  const hint = typeof error.hint === "string" ? error.hint.trim() : "";
  return new Error(hint ? formatAmountsInText(formatIsoDatesInText(hint)) : PAYMENT_ERRORS[token]);
}
