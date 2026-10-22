export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
export const FUTURE_DATE_ERROR = "Não é possível registrar uma data futura.";
const invalidDate = "Informe uma data válida no formato YYYY-MM-DD.";

export function isCalendarDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
export function assertCalendarDate(value: string): void {
  if (!isCalendarDate(value)) throw new Error(invalidDate);
}
export function compareCalendarDates(left: string, right: string): number {
  assertCalendarDate(left);
  assertCalendarDate(right);
  return left === right ? 0 : left < right ? -1 : 1;
}
export function todayISODate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
export function isoDateFromTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(invalidDate);
  return todayISODate(date);
}
export function assertRecordDate(value: string, today = todayISODate()): void {
  if (compareCalendarDates(value, today) > 0) throw new Error(FUTURE_DATE_ERROR);
}
export function competenceFromDate(value: string): string {
  assertCalendarDate(value);
  return value.slice(0, 7);
}
export function referenceMonthFromDate(value: string): string {
  return `${competenceFromDate(value)}-01`;
}
export function currentMonthStart(): string {
  return referenceMonthFromDate(todayISODate());
}
export function assertReferenceMonth(value: string): void {
  assertCalendarDate(value);
  if (!value.endsWith("-01"))
    throw new Error("Competência inválida: use o primeiro dia do mês.");
}
function shiftMonth(value: string, delta: number): string {
  assertReferenceMonth(value);
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7));
  const index = year * 12 + month - 1 + delta;
  const result = `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}-01`;
  assertReferenceMonth(result);
  return result;
}
export function nextMonth(value: string): string {
  return shiftMonth(value, 1);
}
export function previousMonth(value: string): string {
  return shiftMonth(value, -1);
}
export function monthBounds(value: string): { start: string; end: string } {
  assertReferenceMonth(value);
  return { start: value, end: nextMonth(value) };
}
export function formatDateDisplay(value: string): string {
  assertCalendarDate(value);
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}
export function formatMonthLabel(value: string): string {
  assertReferenceMonth(value);
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${months[Number(value.slice(5, 7)) - 1]} de ${value.slice(0, 4)}`;
}
