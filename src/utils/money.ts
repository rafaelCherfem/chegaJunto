// Convert decimal transport values once. Never round financial errors away.
export function toCents(value: number | string): number {
  const text = String(value);
  if (text !== text.trim() || !/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Valor monetário inválido: use no máximo dois decimais.");
  const [whole = "0", fraction = ""] = text.replace(/^-/, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Valor monetário fora do limite.");
  return text.startsWith("-") ? -cents : cents;
}
export function addCents(a: number, b: number): number {
  const sum = a + b;
  if (![a, b, sum].every(Number.isSafeInteger)) throw new Error("Valor monetário fora do limite.");
  return sum;
}
export function debtLabel(cents: number): string {
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(cents) / 100);
  return cents > 0 ? `Passageiro deve ${amount}` : cents < 0 ? `Você deve ${amount} ao passageiro` : "Nenhum valor pendente";
}
