const SKIPPED = new Set(["da", "de", "do", "das", "dos", "e"]);

/** Iniciais para o avatar: no máximo duas letras, ignorando conectivos. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SKIPPED.has(word.toLowerCase()));
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
