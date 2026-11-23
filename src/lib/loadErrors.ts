import { errorMessages } from "@/constants/errorMessages";

export type LoadErrorKind = "network" | "data";

/** Falha ao ler dados. A mensagem continua a genérica; o tipo diz se foi rede ou dados. */
export class LoadError extends Error {
  readonly kind: LoadErrorKind;
  constructor(kind: LoadErrorKind, options?: { cause?: unknown }) {
    super(errorMessages.unexpected, options);
    this.name = "LoadError";
    this.kind = kind;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

// O fetch que falha (sem internet, servidor fora do ar) chega do cliente como erro sem código
// e com a mensagem do navegador; um erro do banco sempre traz código.
function looksLikeNetworkFailure(error: PostgrestLikeError): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return !error.code && /failed to fetch|networkerror|network request failed|load failed/i.test(error.message ?? "");
}

/** Erro devolvido pelo Supabase numa leitura, já classificado. */
export function loadErrorFrom(error: PostgrestLikeError): LoadError {
  return new LoadError(looksLikeNetworkFailure(error) ? "network" : "data", { cause: error });
}

export function loadErrorKind(error: unknown): LoadErrorKind {
  if (error instanceof LoadError) return error.kind;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) return "network";
  return "data";
}

/** Registra o erro real no console, só no ambiente de desenvolvimento. */
export function reportLoadError(source: string, error: unknown): void {
  if (import.meta.env.DEV) console.error(`[${source}]`, error);
}

export const loadErrorMessages: Record<LoadErrorKind, string> = {
  network: "Sem conexão. Verifique a internet e tente de novo.",
  data: "Os dados do ciclo estão inconsistentes. Tente de novo ou avise o suporte.",
};
