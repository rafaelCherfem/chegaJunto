export function todayISODate(): string {
  const now = new Date();
  return toISODate(now);
}

export function currentMonthStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function referenceMonthFromDate(dateISO: string): string {
  const [year, month] = dateISO.split("-");
  return `${year}-${month}-01`;
}

export function formatDateDisplay(dateISO: string): string {
  const [year, month, day] = dateISO.split("-");
  return `${day}/${month}/${year}`;
}

export function formatMonthLabel(referenceMonth: string): string {
  const { year, month } = parseReferenceMonth(referenceMonth);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function previousMonth(referenceMonth: string): string {
  const { year, month } = parseReferenceMonth(referenceMonth);
  return toReferenceMonth(new Date(year, month - 2, 1));
}

export function nextMonth(referenceMonth: string): string {
  const { year, month } = parseReferenceMonth(referenceMonth);
  return toReferenceMonth(new Date(year, month, 1));
}

function parseReferenceMonth(referenceMonth: string): {
  year: number;
  month: number;
} {
  const [yearPart, monthPart] = referenceMonth.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!yearPart || !monthPart || Number.isNaN(year) || Number.isNaN(month)) {
    throw new Error(`Referência de mês inválida: ${referenceMonth}`);
  }

  return { year, month };
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toReferenceMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
