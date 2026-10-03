import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatCurrency } from "@/utils/currency";
import { debtLabel, toCents } from "@/utils/money";
import { formatDateDisplay, formatMonthLabel, todayISODate } from "@/utils/date";
import type { MonthlyCharge, Passenger, Ride } from "@/types/entities";

interface ReceiptData {
  passenger: Passenger;
  charge: MonthlyCharge;
  rides: Ride[];
  referenceMonth: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

export async function generateMonthlyReceipt({
  passenger,
  charge,
  rides,
  referenceMonth,
}: ReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let cursorY = PAGE_HEIGHT - MARGIN;

  function writeLine(
    text: string,
    options: { size?: number; bold?: boolean; gray?: boolean } = {},
  ) {
    const size = options.size ?? 11;
    page.drawText(text, {
      x: MARGIN,
      y: cursorY,
      size,
      font: options.bold ? boldFont : font,
      color: options.gray ? rgb(0.45, 0.45, 0.45) : rgb(0, 0, 0),
    });
    cursorY -= size + 8;
  }

  writeLine("RideLedger", { size: 20, bold: true });
  writeLine(`Comprovante de diárias — ${formatMonthLabel(referenceMonth)}`, {
    size: 12,
    gray: true,
  });
  cursorY -= 8;

  writeLine(`Passageiro: ${passenger.name}`, { bold: true, size: 13 });
  cursorY -= 8;

  writeLine("Diárias registradas", { bold: true, size: 11 });

  const sortedRides = [...rides].sort((a, b) =>
    a.rideDate < b.rideDate ? -1 : 1,
  );

  if (sortedRides.length === 0) {
    writeLine("Nenhuma diária registrada nesta competência.", { gray: true });
  } else {
    for (const ride of sortedRides) {
      writeLine(
        `${formatDateDisplay(ride.rideDate)}  —  ${formatCurrency(ride.rateCharged)}`,
        { size: 10 },
      );
    }
  }

  cursorY -= 8;
  writeLine(`Total do mês: ${formatCurrency(charge.totalAmount)}`, {
    bold: true,
    size: 14,
  });

  const cents = toCents(charge.totalAmount);
  writeLine(debtLabel(cents), { size: 11 });
  if (charge.paid && cents !== 0) {
    writeLine(`Pago: ${formatCurrency(charge.paidAmount)}`, { size: 11 });
  }

  writeLine(
    cents === 0 ? "Situação: sem obrigação" : charge.paid ? "Situação: pago integralmente" : "Situação: pendente",
    { size: 11, bold: charge.paid },
  );

  cursorY -= 16;
  writeLine(`Comprovante gerado em ${formatDateDisplay(todayISODate())}`, {
    size: 8,
    gray: true,
  });

  return pdfDoc.save();
}
