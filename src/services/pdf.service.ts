import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatCurrency } from "@/utils/currency";
import { addCents, debtLabel, toCents } from "@/utils/money";
import { livePayments, paymentDate } from "@/utils/chargePayments";
import { formatDateDisplay, isoDateFromTimestamp, todayISODate } from "@/utils/date";
import type {
  ChargePaymentEvent,
  MonthlyCharge,
  Passenger,
  ReceivedRide,
  Ride,
} from "@/types/entities";

interface ReceiptData {
  passenger: Passenger;
  charge: MonthlyCharge;
  rides: Ride[];
  receivedRides: ReceivedRide[];
  /** Primeiro e último dia do ciclo da cobrança, ambos inclusivos (AAAA-MM-DD). */
  periodStart: string;
  periodEnd: string;
  /** Eventos de pagamento da cobrança (PAYMENT e CANCEL). Sem eles, não há lista de pagamentos. */
  paymentEvents?: ReadonlyArray<ChargePaymentEvent> | undefined;
}

export interface ReceiptLine {
  text: string;
  size?: number;
  bold?: boolean;
  gray?: boolean;
  spaceBefore?: number;
  /** Cabeçalho: repetido no alto de cada página. */
  repeat?: boolean;
  /** Esta linha fica na mesma página que a próxima (título com o que ele introduz). */
  keepWithNext?: boolean;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
// Linhas por página: o que cabe entre as duas margens.
const PAGE_CAPACITY = PAGE_HEIGHT - 2 * MARGIN;
// Até este número de pagamentos o bloco do total fica inteiro na mesma página.
const MAX_PAYMENTS_KEPT_TOGETHER = 6;

const byDate = <T>(key: (item: T) => string) => (a: T, b: T) =>
  key(a) < key(b) ? -1 : 1;

// Pagamentos vigentes da cobrança, por data. Se a soma deles não fechar com o valor recebido
// (histórico incompleto), a lista inteira é omitida e o comprovante mostra só os totais.
function receivedPayments(
  charge: MonthlyCharge,
  events: ReadonlyArray<ChargePaymentEvent> | undefined,
): ChargePaymentEvent[] {
  if (!events) return [];
  const live = livePayments(events, charge.id, charge.paidAmount);
  const sum = live.reduce((total, payment) => addCents(total, toCents(payment.signedAmount)), 0);
  if (sum !== toCents(charge.paidAmount)) return [];
  return [...live].sort(
    (a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.revision - b.revision),
  );
}

function paymentSection(payments: ChargePaymentEvent[]): ReceiptLine[] {
  if (payments.length === 0) return [];
  // Só devoluções (valores negativos): mostradas como valores positivos, sob outro título.
  const returns = payments.every((payment) => toCents(payment.signedAmount) < 0);
  const lines: ReceiptLine[] = [
    { text: returns ? "Devoluções feitas" : "Pagamentos recebidos", bold: true, spaceBefore: 8 },
  ];
  for (const payment of payments) {
    const amount = returns ? Math.abs(payment.signedAmount) : payment.signedAmount;
    lines.push({
      text: `${paymentDate(payment.occurredAt)}  —  ${formatCurrency(amount)}`,
      size: 10,
    });
  }
  return lines;
}

function receiptSituation(charge: MonthlyCharge, lastPaymentAt?: string): ReceiptLine[] {
  const cents = toCents(charge.totalAmount);
  const paidCents = toCents(charge.paidAmount);

  if (cents === 0 && paidCents === 0) {
    return [{ text: debtLabel(0) }, { text: "Situação: sem obrigação" }];
  }

  if (charge.paid) {
    // A data é a do último pagamento vigente; a da cobrança serve de reserva.
    const paidAt = lastPaymentAt ?? charge.paidAt;
    const paidOn = paidAt ? ` em ${formatDateDisplay(isoDateFromTimestamp(paidAt))}` : "";
    if (cents < 0) {
      return [
        { text: `Devolvido: ${formatCurrency(-paidCents / 100)}` },
        { text: `Situação: devolução feita${paidOn}`, bold: true },
      ];
    }
    const refundCents = paidCents > cents ? paidCents - cents : 0;
    const lines: ReceiptLine[] = [];
    if (paidCents > 0) lines.push({ text: `Já pago: ${formatCurrency(paidCents / 100)}` });
    if (refundCents > 0) {
      lines.push({ text: `Saldo a devolver: ${formatCurrency(refundCents / 100)}` });
      lines.push({ text: `Situação: quitado${paidOn}, com saldo a devolver`, bold: true });
    } else {
      lines.push({ text: `Situação: pago integralmente${paidOn}`, bold: true });
    }
    return lines;
  }

  if (cents < 0 && paidCents < 0) {
    return [
      { text: `Já devolvido: ${formatCurrency(-paidCents / 100)}` },
      { text: `Falta devolver: ${formatCurrency((paidCents - cents) / 100)}` },
      { text: "Situação: devolução parcial" },
    ];
  }

  if (paidCents !== 0) {
    return [
      { text: `Já pago: ${formatCurrency(paidCents / 100)}` },
      { text: `Falta pagar: ${formatCurrency((cents - paidCents) / 100)}` },
      { text: "Situação: parcialmente pago" },
    ];
  }

  return [{ text: debtLabel(cents) }, { text: "Situação: pendente" }];
}

export function buildReceiptLines(
  { passenger, charge, rides, receivedRides, periodStart, periodEnd, paymentEvents }: ReceiptData,
  generatedOn = todayISODate(),
): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { text: "chegaJunto", size: 20, bold: true, repeat: true },
    {
      text: `Comprovante de diárias — ${formatDateDisplay(periodStart)} a ${formatDateDisplay(periodEnd)}`,
      size: 12,
      gray: true,
      repeat: true,
    },
    { text: `Passageiro: ${passenger.name}`, bold: true, size: 13, spaceBefore: 8, repeat: true },
    { text: "Diárias registradas", bold: true, spaceBefore: 8, keepWithNext: true },
  ];

  const sortedRides = [...rides].sort(byDate((ride) => ride.rideDate));
  if (sortedRides.length === 0) {
    lines.push({ text: "Nenhuma diária registrada neste período.", gray: true });
  }
  for (const ride of sortedRides) {
    lines.push({
      text: `${formatDateDisplay(ride.rideDate)}  —  ${formatCurrency(ride.rateCharged)}`,
      size: 10,
    });
  }

  const sortedReceived = [...receivedRides].sort(byDate((item) => item.receivedDate));
  if (sortedReceived.length > 0) {
    lines.push({ text: "Compensações", bold: true, spaceBefore: 8, keepWithNext: true });
    for (const received of sortedReceived) {
      lines.push({
        text: `${formatDateDisplay(received.receivedDate)}  —  ${formatCurrency(received.amount)}`,
        size: 10,
      });
    }
  }

  const rideCents = sortedRides.reduce((sum, ride) => sum + toCents(ride.rateCharged), 0);
  const compensationCents = sortedReceived.reduce(
    (sum, received) => sum + toCents(received.amount),
    0,
  );
  if (compensationCents > 0) {
    lines.push({
      text: `Diárias: ${formatCurrency(rideCents / 100)}`,
      spaceBefore: 8,
      keepWithNext: true,
    });
    lines.push({ text: `Compensação: -${formatCurrency(compensationCents / 100)}`, keepWithNext: true });
  }

  // Bloco final: total, pagamentos recebidos, já pago, falta pagar e situação.
  const payments = receivedPayments(charge, paymentEvents);
  const lastPayment = payments[payments.length - 1];
  const tail: ReceiptLine[] = [
    {
      text: `Total do período: ${formatCurrency(charge.totalAmount)}`,
      bold: true,
      size: 14,
      spaceBefore: compensationCents > 0 ? 4 : 8,
    },
    ...paymentSection(payments),
    ...receiptSituation(charge, lastPayment?.occurredAt),
  ];
  // O bloco não se separa do seu título. Com muitos pagamentos a lista pode atravessar a página,
  // mas o título fica com o primeiro pagamento e o último fica com o resumo.
  const lastPaymentIndex = payments.length > 0 ? payments.length + 1 : -1;
  tail.forEach((line, index) => {
    if (index === tail.length - 1) return;
    const together =
      payments.length <= MAX_PAYMENTS_KEPT_TOGETHER ||
      index <= 2 ||
      index >= lastPaymentIndex;
    if (together) line.keepWithNext = true;
  });
  lines.push(...tail);

  lines.push({
    text: `Comprovante gerado em ${formatDateDisplay(generatedOn)}`,
    size: 8,
    gray: true,
    spaceBefore: 16,
  });

  return lines;
}

const lineHeight = (line: ReceiptLine) => (line.spaceBefore ?? 0) + (line.size ?? 11) + 8;

/**
 * Reparte as linhas em páginas. Cada página começa com o cabeçalho (título do ciclo e nome do
 * passageiro); uma linha nunca é cortada, e as que têm `keepWithNext` vão juntas com a seguinte.
 */
export function paginateReceipt(lines: ReceiptLine[]): ReceiptLine[][] {
  const header = lines.filter((line) => line.repeat);
  const body = lines.filter((line) => !line.repeat);
  const headerHeight = header.reduce((sum, line) => sum + lineHeight(line), 0);

  const pages: ReceiptLine[][] = [[...header]];
  let used = headerHeight;
  let bodyOnPage = 0;

  const newPage = () => {
    pages.push([...header]);
    used = headerHeight;
    bodyOnPage = 0;
  };
  const place = (line: ReceiptLine) => {
    // No alto de uma página não sobra espaço antes da linha.
    const placed = bodyOnPage === 0 && line.spaceBefore ? { ...line, spaceBefore: 0 } : line;
    pages[pages.length - 1]!.push(placed);
    used += lineHeight(placed);
    bodyOnPage += 1;
  };

  // Unidades: uma linha, ou a sequência de linhas ligadas por keepWithNext.
  const units: ReceiptLine[][] = [];
  let current: ReceiptLine[] = [];
  for (const line of body) {
    current.push(line);
    if (!line.keepWithNext) {
      units.push(current);
      current = [];
    }
  }
  if (current.length > 0) units.push(current);

  for (const unit of units) {
    const need = unit.reduce((sum, line) => sum + lineHeight(line), 0);
    if (used + need > PAGE_CAPACITY && bodyOnPage > 0) newPage();
    if (used + need <= PAGE_CAPACITY) {
      unit.forEach(place);
      continue;
    }
    // Mais alta que uma página inteira: segue linha a linha.
    for (const line of unit) {
      if (used + lineHeight(line) > PAGE_CAPACITY && bodyOnPage > 0) newPage();
      place(line);
    }
  }
  return pages;
}

export function stripUnsupported(text: string, supported: Set<number>): string {
  let result = "";
  let removed = false;
  for (const char of text) {
    if (!supported.has(char.codePointAt(0)!)) {
      removed = true;
      continue;
    }
    if (removed && char === " " && (result === "" || result.endsWith(" "))) continue;
    result += char;
    removed = false;
  }
  return removed ? result.trimEnd() : result;
}

export async function generateMonthlyReceipt(data: ReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());

  for (const pageLines of paginateReceipt(buildReceiptLines(data))) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursorY = PAGE_HEIGHT - MARGIN;
    for (const line of pageLines) {
      const size = line.size ?? 11;
      cursorY -= line.spaceBefore ?? 0;
      page.drawText(stripUnsupported(line.text, supported), {
        x: MARGIN,
        y: cursorY,
        size,
        font: line.bold ? boldFont : font,
        color: line.gray ? rgb(0.45, 0.45, 0.45) : rgb(0, 0, 0),
      });
      cursorY -= size + 8;
    }
  }

  return pdfDoc.save();
}
