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
