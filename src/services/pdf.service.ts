import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatCurrency } from "@/utils/currency";
import { debtLabel, toCents } from "@/utils/money";
import {
  formatDateDisplay,
  formatMonthLabel,
  isoDateFromTimestamp,
  todayISODate,
} from "@/utils/date";
import type { MonthlyCharge, Passenger, ReceivedRide, Ride } from "@/types/entities";

interface ReceiptData {
  passenger: Passenger;
  charge: MonthlyCharge;
  rides: Ride[];
  receivedRides: ReceivedRide[];
  referenceMonth: string;
}

export interface ReceiptLine {
  text: string;
  size?: number;
  bold?: boolean;
  gray?: boolean;
  spaceBefore?: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

const byDate = <T>(key: (item: T) => string) => (a: T, b: T) =>
  key(a) < key(b) ? -1 : 1;

function receiptSituation(charge: MonthlyCharge): ReceiptLine[] {
  const cents = toCents(charge.totalAmount);
  const paidCents = toCents(charge.paidAmount);

  if (cents === 0 && paidCents === 0) {
    return [{ text: debtLabel(0) }, { text: "Situação: sem obrigação" }];
  }

  if (charge.paid) {
    const paidOn = charge.paidAt
      ? ` em ${formatDateDisplay(isoDateFromTimestamp(charge.paidAt))}`
      : "";
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
  { passenger, charge, rides, receivedRides, referenceMonth }: ReceiptData,
  generatedOn = todayISODate(),
): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { text: "chegaJunto", size: 20, bold: true },
    {
      text: `Comprovante de diárias — ${formatMonthLabel(referenceMonth)}`,
      size: 12,
      gray: true,
    },
    { text: `Passageiro: ${passenger.name}`, bold: true, size: 13, spaceBefore: 8 },
    { text: "Diárias registradas", bold: true, spaceBefore: 8 },
  ];

  const sortedRides = [...rides].sort(byDate((ride) => ride.rideDate));
  if (sortedRides.length === 0) {
    lines.push({ text: "Nenhuma diária registrada nesta competência.", gray: true });
  }
  for (const ride of sortedRides) {
    lines.push({
      text: `${formatDateDisplay(ride.rideDate)}  —  ${formatCurrency(ride.rateCharged)}`,
      size: 10,
    });
  }

  const sortedReceived = [...receivedRides].sort(byDate((item) => item.receivedDate));
  if (sortedReceived.length > 0) {
    lines.push({ text: "Compensações", bold: true, spaceBefore: 8 });
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
    lines.push({ text: `Diárias: ${formatCurrency(rideCents / 100)}`, spaceBefore: 8 });
    lines.push({ text: `Compensação: -${formatCurrency(compensationCents / 100)}` });
  }

  lines.push({
    text: `Total do mês: ${formatCurrency(charge.totalAmount)}`,
    bold: true,
    size: 14,
    spaceBefore: compensationCents > 0 ? 4 : 8,
  });
  lines.push(...receiptSituation(charge));

  lines.push({
    text: `Comprovante gerado em ${formatDateDisplay(generatedOn)}`,
    size: 8,
    gray: true,
    spaceBefore: 16,
  });

  return lines;
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
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());

  let cursorY = PAGE_HEIGHT - MARGIN;

  for (const line of buildReceiptLines(data)) {
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

  return pdfDoc.save();
}
