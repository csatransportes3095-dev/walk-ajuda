import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb, createFinancialSale } from "../db";
import { syncUnifiedCustomerRegistry, requireCompleteMainCustomerProfile } from "../customerIdentity";
import { findMainCustomerByIdentity, getRouteAccess } from "../customerAccess";
import { storagePut } from "../storage";
import { spreadsheetSessions } from "../../drizzle/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { applyH2ScoreEventFromSubmission, approveH2ScoreSubmission, backfillLegacyH2ScoreEvents, getClientH2ScoreSummary, getCustomerH2ScoreSummary, getH2ScoreCustomerDirectory, getH2ScoreSubmissionMap, getLoanH2ScoreConfig, registerH2ScoreSubmission, refuseH2ScoreSubmission } from "../loans/h2Score";
import { calculateLateFeeForInstallment } from "../loans/lateFee";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import { sendMailDirect } from "../_core/sendMailDirect";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// ââ€â‚¬ââ€â‚¬ââ€â‚¬ Helper: obter data de hoje em UTC-3 (Brasil) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
function getBrazilClock(now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "0";
  return {
    date: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    hour: Number(valueOf("hour")),
  };
}

function getBrazilToday(): string {
  return getBrazilClock().date;
}

function getBrazilHour(): number {
  return getBrazilClock().hour;
}

// Compara CPF e telefone ignorando pontos, traços, espaços, parênteses e DDI.
// Assim o mesmo cliente não perde acesso ao empréstimo quando os cadastros foram salvos em formatos diferentes.
function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}
async function syncLegacyLoanAccess(db: any, session: any, enabled: boolean): Promise<void> {
  const token = String(session?.token || '').trim();
  const loanRows = await qRows(db, drizzleSql`SELECT id, cpf, phone, spreadsheetToken FROM loanClients`);
  const relatedIds = loanRows.filter((row: any) => String(row.spreadsheetToken || '').trim() === token || isSameLoanIdentity(row, session?.cpf, session?.phone)).map((row: any) => Number(row.id)).filter(Boolean);
  if (!relatedIds.length) return;
  await db.execute(drizzleSql`UPDATE loanClients SET loanEnabled=${enabled ? 1 : 0}, updatedAt=NOW() WHERE id IN (${drizzleSql.raw(relatedIds.join(','))})`);
}

async function requireLoanRouteAccess(db: any, rawToken: string): Promise<any> {
  const token = rawToken.trim();
  const sessions = await qRows(db, drizzleSql`
    SELECT ss.*, sc.name, sc.phone, sc.cpf
    FROM spreadsheetSessions ss
    JOIN spreadsheetClients sc ON sc.id=ss.clientId
    WHERE ss.token=${token} AND ss.expiresAt > NOW()
    LIMIT 1
  `);
  const session = sessions[0];
  if (!session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' });
  try {
    await requireCompleteMainCustomerProfile(db, { phone: session.phone, cpf: session.cpf });
  } catch {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Atualize foto, e-mail, CPF e telefone no cadastro principal para continuar.' });
  }
  const mainCustomer = await findMainCustomerByIdentity({ phone: session.phone, cpf: session.cpf }, db);
  if (!mainCustomer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Conclua o cadastro principal para continuar.' });
  const access = await getRouteAccess(mainCustomer.id, db);
  const loanAllowed = !access.restricted || access.routes.includes('emprestimo');
  await syncLegacyLoanAccess(db, session, loanAllowed);
  if (!loanAllowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso não autorizado para a área de Empréstimos.' });
  }
  return session;
}

function isSameLoanIdentity(row: any, cpf?: string | null, phone?: string | null) {
  const cpfDigits = onlyDigits(cpf);
  const phoneDigits = onlyDigits(phone);
  const rowCpf = onlyDigits(row?.cpf);
  const rowPhone = onlyDigits(row?.phone);
  const cpfMatch = !!cpfDigits && !!rowCpf && cpfDigits === rowCpf;
  const phoneMatch = !!phoneDigits && !!rowPhone && (phoneDigits === rowPhone || phoneDigits.endsWith(rowPhone) || rowPhone.endsWith(phoneDigits));
  return cpfMatch || phoneMatch;
}

// ââ€â‚¬ââ€â‚¬ââ€â‚¬ Helper: gerar PDF de recibo ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
async function generateReceiptPdf(data: {
  receiptNumber: string;
  clientName: string;
  clientCpf?: string;
  installmentNumber: number;
  totalInstallments: number;
  amountPaid: string;
  paidAt: string;
  nextDueDate?: string;
  confirmedBy?: string;
  emittedAt: string;
  originalAmount?: string;  // valor original antes da taxa
  feeApplied?: string;      // valor da taxa/multa aplicada
  isInterestOnly?: boolean; // true = recibo de juros (rolagem de dívida)
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.rect(0, 0, doc.page.width, 90).fill('#0f172a');
    doc.fillColor('#22c55e').fontSize(22).font('Helvetica-Bold').text('H2 COLOMBIANO', 50, 28, { align: 'left' });
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text(data.isInterestOnly ? 'Recibo de Pagamento de Juros' : 'Recibo de Pagamento', 50, 58, { align: 'left' });
    doc.fillColor('#64748b').fontSize(9).text(`Emitido em: ${data.emittedAt}`, 0, 58, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#22c55e').lineWidth(2).stroke();
    doc.moveDown(0.8);
    const recY = doc.y;
    doc.rect(50, recY, doc.page.width - 100, 36).fill('#f0fdf4');
    doc.fillColor('#15803d').fontSize(12).font('Helvetica-Bold').text(`NÂº do Recibo: ${data.receiptNumber}`, 60, recY + 10);
    doc.moveDown(1.5);
    const labelColor = '#64748b';
    const valueColor = '#0f172a';
    const rowH = 30;
    const col1 = 50, col2 = 210;
    // Monta as linhas do recibo, incluindo detalhamento de taxa se houver
    const hasFee = data.feeApplied != null && parseFloat(data.feeApplied || '0') > 0;
    const fmtBRL = (v: string | number) => `R$ ${parseFloat(String(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows: string[][] = [
      ['Cliente:', data.clientName],
      ['CPF:', data.clientCpf || 'Não informado'],
      ['Parcela:', `${data.installmentNumber} de ${data.totalInstallments}`],
    ];
    if (data.isInterestOnly) {
      // Recibo de juros: mostrar detalhamento de juros + taxa
      const totalJuros = parseFloat(data.amountPaid);
      const feeNum = hasFee ? parseFloat(data.feeApplied!) : 0;
      const jurosLiquidos = totalJuros - feeNum;
      rows.push(['Tipo:', 'Pagamento de Juros (Dívida Rolada)']);
      rows.push(['Juros Cobrados:', fmtBRL(jurosLiquidos)]);
      if (hasFee) {
        rows.push(['Taxa de Atraso:', `+ ${fmtBRL(data.feeApplied!)}  (inclusa)`]);
      }
      rows.push(['Total Cobrado:', fmtBRL(data.amountPaid)]);
      rows.push(['Obs.:', 'Principal rolado para nova parcela']);
    } else if (hasFee) {
      rows.push(['Valor Original:', fmtBRL(data.originalAmount || data.amountPaid)]);
      rows.push(['Taxa / Multa de Atraso:', `+ ${fmtBRL(data.feeApplied!)}  (inclusa)`]);
      rows.push(['Valor Total Pago:', fmtBRL(data.amountPaid)]);
    } else {
      rows.push(['Valor Pago:', fmtBRL(data.amountPaid)]);
    }
    rows.push(['Data do Pagamento:', data.paidAt]);
    rows.push(['Próximo Vencimento:', data.nextDueDate || 'ââ‚¬â€']);
    rows.push(['Confirmado por:', data.confirmedBy || 'ââ‚¬â€']);
    let y = doc.y;
    rows.forEach(([label, value], i) => {
      const isFeeRow = label === 'Taxa / Multa de Atraso:' || label === 'Taxa de Atraso:';
      const isTotalRow = label === 'Valor Total Pago:' || label === 'Total Cobrado:';
      const bg = isFeeRow ? '#fff1f2' : isTotalRow ? '#f0fdf4' : (i % 2 === 0 ? '#f8fafc' : '#ffffff');
      doc.rect(50, y, doc.page.width - 100, rowH).fill(bg);
      const lColor = isFeeRow ? '#dc2626' : isTotalRow ? '#15803d' : labelColor;
      const vColor = isFeeRow ? '#dc2626' : isTotalRow ? '#15803d' : valueColor;
      // Remove emojis para PDFKit
      const cleanValue = value.replace(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g, '').trim();
      doc.fillColor(lColor).fontSize(9).font('Helvetica').text(label, col1 + 8, y + 10);
      doc.fillColor(vColor).fontSize(10).font('Helvetica-Bold').text(cleanValue, col2, y + 9, { width: doc.page.width - col2 - 60 });
      y += rowH;
    });
    y += 14;
    doc.rect(50, y, doc.page.width - 100, 48).fill(data.isInterestOnly ? '#fff7ed' : '#dcfce7');
    doc.fillColor(data.isInterestOnly ? '#c2410c' : '#15803d').fontSize(15).font('Helvetica-Bold')
      .text(`${data.isInterestOnly ? 'JUROS COBRADOS' : 'VALOR PAGO'}: R$ ${parseFloat(data.amountPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, y + 14, { align: 'center', width: doc.page.width - 120 });
    const footerY = doc.page.height - 70;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
      .text('Este recibo é um comprovante de pagamento emitido pela H2 COLOMBIANO.', 50, footerY + 10, { align: 'center', width: doc.page.width - 100 })
      .text('Guarde este documento para sua segurança.', 50, footerY + 22, { align: 'center', width: doc.page.width - 100 });
    doc.end();
  });
}

// ââ€â‚¬ââ€â‚¬ââ€â‚¬ Helper: converter PDF de recibo para JPG ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
async function generateReceiptJpg(pdfBuffer: Buffer): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-'));
  const pdfPath = path.join(tmpDir, 'receipt.pdf');
  const jpgBase = path.join(tmpDir, 'receipt');
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    // pdftoppm converte PDF para PPM (formato intermediário), depois sharp converte para JPG
    execSync(`pdftoppm -r 200 -jpeg -jpegopt quality=95 "${pdfPath}" "${jpgBase}"`, { timeout: 15000 });
    // Pegar o primeiro arquivo gerado (página 1)
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    if (!files.length) {
      // fallback: tentar com PPM e converter com sharp
      execSync(`pdftoppm -r 200 "${pdfPath}" "${jpgBase}"`, { timeout: 15000 });
      const ppmFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.ppm'));
      if (!ppmFiles.length) throw new Error('pdftoppm não gerou arquivo de saída');
      ppmFiles.sort();
      const ppmBuffer = fs.readFileSync(path.join(tmpDir, ppmFiles[0]));
      const jpgBuffer = await sharp(ppmBuffer).jpeg({ quality: 95 }).toBuffer();
      return jpgBuffer;
    }
    files.sort();
    const jpgBuffer = fs.readFileSync(path.join(tmpDir, files[0]));
    // Usar sharp para garantir qualidade e formato correto
    return await sharp(jpgBuffer).jpeg({ quality: 95 }).toBuffer();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function sendReceiptEmail(to: string, clientName: string, receiptNumber: string, installmentNumber: number, pdfBuffer: Buffer): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com', port: 465, secure: true,
    auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
  });
  await transporter.sendMail({
    from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
    to,
    subject: `Recibo de Pagamento ââ‚¬â€ Parcela #${installmentNumber} | ${receiptNumber}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;"><div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;"><h2 style="color:#22c55e;margin:0;">H2 COLOMBIANO</h2><p style="color:#94a3b8;margin:4px 0 0;">Recibo de Pagamento</p></div><div style="background:#f8fafc;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;"><p style="color:#0f172a;">Olá, <strong>${clientName}</strong>!</p><p style="color:#374151;">Segue em anexo o recibo da <strong>Parcela #${installmentNumber}</strong>.</p><p style="color:#374151;">Número do recibo: <strong>${receiptNumber}</strong></p><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"><p style="color:#6b7280;font-size:12px;">Guarde este recibo para sua segurança.</p></div></div>`,
    attachments: [{ filename: `recibo-${receiptNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
}

// ââ€â‚¬ââ€â‚¬ââ€â‚¬ Helpers ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Avança para o próximo dia útil conforme workDays ("seg_sab" = 0=dom excluído, "seg_dom" = todos)
function nextWorkDay(dateStr: string, workDays: "seg_sab" | "seg_dom" | "custom"): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  if (workDays === "seg_sab") {
    // Pula domingo (0)
    while (d.getUTCDay() === 0) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return d.toISOString().slice(0, 10);
}

// Número fixo de parcelas diárias:
// Segââ‚¬â€œSáb = 20 parcelas | Segââ‚¬â€œDom = 25 parcelas | custom = definido pelo admin
function calcDailyInstallments(
  _releaseDate: string,
  _maxDays: number,
  workDays: "seg_sab" | "seg_dom" | "custom",
  customInstallments?: number
): number {
  if (workDays === "custom") return customInstallments && customInstallments >= 1 ? customInstallments : 1;
  return workDays === "seg_sab" ? 20 : 25;
}

// Gera as datas de vencimento de cada parcela
function generateInstallments(
  releaseDate: string,
  paymentType: "diario" | "semanal" | "mensal" | "quinzenal",
  installments: number,
  totalAmount: number,
  workDays: "seg_sab" | "seg_dom" | "custom" = "seg_sab"
) {
  const result = [];
  const perInstallment = Math.round((totalAmount / installments) * 100) / 100;
  let currentDate = releaseDate;
  for (let i = 1; i <= installments; i++) {
    if (paymentType === "diario") {
      currentDate = nextWorkDay(currentDate, workDays);
    } else if (paymentType === "semanal") {
      currentDate = addDays(currentDate, 7);
    } else if (paymentType === "quinzenal") {
      currentDate = addDays(currentDate, 15);
    } else {
      currentDate = addDays(currentDate, 30);
    }
    const amount = i === installments
      ? Math.round((totalAmount - perInstallment * (installments - 1)) * 100) / 100
      : perInstallment;
    result.push({ installmentNumber: i, dueDate: currentDate, amount });
  }
  return result;
}

// Calcula simulação de parcelas sem criar no banco (usado pelo frontend para preview)
function simulateLoan(
  amount: number,
  interestRate: number,
  paymentType: "diario" | "semanal" | "mensal" | "quinzenal",
  maxDays: number,
  workDays: "seg_sab" | "seg_dom" | "custom",
  releaseDate: string,
  customInstallments?: number
) {
  const interestAmount = Math.round(amount * (interestRate / 100) * 100) / 100;
  const totalAmount = Math.round((amount + interestAmount) * 100) / 100;

  let installments: number;
  if (paymentType === "diario") {
    installments = calcDailyInstallments(releaseDate, maxDays, workDays, customInstallments);
    if (installments < 1) installments = 1;
  } else if (paymentType === "semanal") {
    installments = Math.floor(maxDays / 7);
    if (installments < 1) installments = 1;
  } else if (paymentType === "quinzenal") {
    installments = Math.floor(maxDays / 15);
    if (installments < 1) installments = 1;
  } else {
    installments = Math.floor(maxDays / 30);
    if (installments < 1) installments = 1;
  }

  const perInstallment = Math.round((totalAmount / installments) * 100) / 100;
  const schedule = generateInstallments(releaseDate, paymentType, installments, totalAmount, workDays);
  const dueDate = schedule[schedule.length - 1]?.dueDate || addDays(releaseDate, maxDays);

  return { interestAmount, totalAmount, installments, perInstallment, dueDate, schedule };
}

// Helper: executa query e retorna array de rows
async function qRows(db: any, query: ReturnType<typeof drizzleSql>): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result) as any[];
}

// ── Chave PIX do cliente ────────────────────────────────────────────────────
// O sistema já teve dois grupos de colunas para o PIX. Estes auxiliares tratam
// ambos e também cobrem cadastros duplicados do mesmo CPF/telefone.
function pixKeyOf(row: any) {
  return String(row?.client_pix_key || row?.clientPixKey || row?.pixKey || '').trim();
}
function pixNameOf(row: any) {
  return String(row?.client_pix_name || row?.clientPixName || row?.pixName || '').trim();
}
function pixBankOf(row: any) {
  return String(row?.client_pix_bank || row?.clientPixBank || row?.pixBank || '').trim();
}
function resolvePixSource(loan: any, clients: any[]) {
  const sameClient = clients.filter((candidate: any) =>
    Number(candidate.id) === Number(loan.clientId) ||
    isSameLoanIdentity(candidate, loan.clientCpf || loan.customerCpf, loan.clientPhone)
  );
  // Primeiro preserva a chave do próprio cadastro do empréstimo; se estiver vazia,
  // usa a chave válida mais recente de outro cadastro com o mesmo CPF/telefone.
  return sameClient
    .filter((candidate: any) => !!pixKeyOf(candidate))
    .sort((a: any, b: any) => {
      const ownA = Number(a.id) === Number(loan.clientId) ? 0 : 1;
      const ownB = Number(b.id) === Number(loan.clientId) ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })[0] || null;
}

// ââ€â‚¬ââ€â‚¬ââ€â‚¬ Router ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

// ── Migração automática: adicionar 'parcelado' ao ENUM paymentType ──────────
let _paymentTypeParceladoMigrated = false;
async function ensureParceladoPaymentType(db: any) {
  if (_paymentTypeParceladoMigrated) return;
  _paymentTypeParceladoMigrated = true;
  try {
    // 1. Verificar se paymentType já aceita 'parcelado'
    const cols = await qRows(db, drizzleSql`SHOW COLUMNS FROM loans LIKE 'paymentType'`);
    if (cols.length > 0) {
      const colType = String(cols[0].Type || cols[0].type || '');
      if (!colType.includes('parcelado')) {
        const match = colType.match(/enum\((.+)\)/i);
        if (match) {
          const currentVals = match[1];
          await db.execute(drizzleSql.raw(`ALTER TABLE loans MODIFY COLUMN paymentType ENUM(${currentVals},'parcelado') NOT NULL DEFAULT 'diario'`));
          console.log('[loans] paymentType ENUM atualizado com parcelado');
        }
      }
    }
    // 2. Tornar releaseDate nullable para empréstimos parcelados (PIX confirmado depois)
    const relCols = await qRows(db, drizzleSql`SHOW COLUMNS FROM loans LIKE 'releaseDate'`);
    if (relCols.length > 0) {
      const nullable = String(relCols[0].Null || relCols[0].null || '').toUpperCase();
      if (nullable !== 'YES') {
        await db.execute(drizzleSql.raw(`ALTER TABLE loans MODIFY COLUMN releaseDate VARCHAR(10) NULL DEFAULT NULL`));
        console.log('[loans] releaseDate agora aceita NULL');
      }
    }
  } catch (e: any) {
    console.warn('[loans] Não foi possível migrar paymentType/releaseDate:', e?.message);
  }
}

// ── Migração automática: controle de PIX de liberação ao cliente ────────────
let _pixDisbursementMigrated = false;
async function ensurePixDisbursementColumns(db: any) {
  if (_pixDisbursementMigrated) return;
  _pixDisbursementMigrated = true;
  try {
    const columns = await qRows(db, drizzleSql`SHOW COLUMNS FROM loans`);
    const names = new Set(columns.map((col: any) => String(col.Field || col.field || '').toLowerCase()));
    if (!names.has('pixsentat')) await db.execute(drizzleSql.raw(`ALTER TABLE loans ADD COLUMN pixSentAt DATETIME NULL DEFAULT NULL`));
    if (!names.has('pixsentby')) await db.execute(drizzleSql.raw(`ALTER TABLE loans ADD COLUMN pixSentBy VARCHAR(100) NULL DEFAULT NULL`));
    if (!names.has('pixconfirmeddate')) await db.execute(drizzleSql.raw(`ALTER TABLE loans ADD COLUMN pixConfirmedDate VARCHAR(10) NULL DEFAULT NULL`));
    if (!names.has('pixsendnote')) await db.execute(drizzleSql.raw(`ALTER TABLE loans ADD COLUMN pixSendNote TEXT NULL`));
  } catch (e: any) {
    console.warn('[loans] Não foi possível preparar os campos de PIX enviado:', e?.message);
  }
}

// Sincroniza somente campos PIX antigos que estavam vazios no formato novo.
// Não sobrescreve uma chave PIX já salva pelo ADM.
let _clientPixFieldsSynced = false;
async function ensureClientPixFieldsSynced(db: any) {
  if (_clientPixFieldsSynced) return;
  _clientPixFieldsSynced = true;
  try {
    await db.execute(drizzleSql`
      UPDATE loanClients
      SET client_pix_key = CASE WHEN NULLIF(TRIM(COALESCE(client_pix_key, '')), '') IS NULL THEN pixKey ELSE client_pix_key END,
          client_pix_name = CASE WHEN NULLIF(TRIM(COALESCE(client_pix_name, '')), '') IS NULL THEN pixName ELSE client_pix_name END,
          updatedAt = NOW()
      WHERE (NULLIF(TRIM(COALESCE(client_pix_key, '')), '') IS NULL AND NULLIF(TRIM(COALESCE(pixKey, '')), '') IS NOT NULL)
         OR (NULLIF(TRIM(COALESCE(client_pix_name, '')), '') IS NULL AND NULLIF(TRIM(COALESCE(pixName, '')), '') IS NOT NULL)
    `);
  } catch (e: any) {
    console.warn('[loans] Não foi possível sincronizar campos PIX legados:', e?.message);
  }
}

// ── Migração automática: tabela loanInstallmentPlans ──────────────────────
let _installmentPlansMigrated = false;
let _installmentPlansMigrationPromise: Promise<void> | null = null;
async function ensureInstallmentPlansTable(db: any) {
  if (_installmentPlansMigrated) return;
  if (_installmentPlansMigrationPromise) return _installmentPlansMigrationPromise;
  _installmentPlansMigrationPromise = (async () => {
  await ensureParceladoPaymentType(db);
  await db.execute(drizzleSql`
    CREATE TABLE IF NOT EXISTS loanInstallmentPlans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      parcelas INT NOT NULL,
      percentual DECIMAL(10,2) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      ordem INT NOT NULL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  const existing = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallmentPlans`);
  if (parseInt(existing[0]?.cnt || '0') === 0) {
    const defaults = [[1,30],[2,50],[3,75],[4,100],[5,125],[6,150],[7,175],[8,200],[9,225]];
    for (let i = 0; i < defaults.length; i++) {
      const [parcelas, percentual] = defaults[i];
      await db.execute(drizzleSql`INSERT INTO loanInstallmentPlans (parcelas, percentual, ativo, ordem) VALUES (${parcelas}, ${percentual}, 1, ${i})`);
    }
  }
    _installmentPlansMigrated = true;
  })().catch((error) => {
    _installmentPlansMigrationPromise = null;
    _installmentPlansMigrated = false;
    throw error;
  });
  return _installmentPlansMigrationPromise;
}

export const loanRouter = router({

  // ââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Â
  // LADO DO ADMIN ââ‚¬â€ adminProcedure
  // ââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Â

  // ââ€â‚¬ââ€â‚¬ BUSCA CLIENTE NO SISTEMA PRINCIPAL ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  // ── CONFIGURAÇÃO DO PARCELAMENTO (ADM) ───────────────────────────────────────────────────
  listInstallmentPlans: adminProcedure.query(async () => {
    const db = await getDb() as any;
    await ensureInstallmentPlansTable(db);
    return await qRows(db, drizzleSql`SELECT * FROM loanInstallmentPlans ORDER BY ordem ASC, parcelas ASC`);
  }),

  saveInstallmentPlan: adminProcedure.input(z.object({
    id: z.number().optional(),
    parcelas: z.number().int().min(1).max(120),
    percentual: z.number().min(0).max(9999),
    ativo: z.number().int().min(0).max(1).default(1),
    ordem: z.number().int().default(0),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await ensureInstallmentPlansTable(db);
    if (input.id) {
      await db.execute(drizzleSql`UPDATE loanInstallmentPlans SET parcelas=${input.parcelas}, percentual=${input.percentual}, ativo=${input.ativo}, ordem=${input.ordem}, updatedAt=NOW() WHERE id=${input.id}`);
    } else {
      await db.execute(drizzleSql`INSERT INTO loanInstallmentPlans (parcelas, percentual, ativo, ordem) VALUES (${input.parcelas}, ${input.percentual}, ${input.ativo}, ${input.ordem})`);
    }
    return { ok: true };
  }),

  deleteInstallmentPlan: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    // Verificar se já foi usado em algum empréstimo
    const used = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loans WHERE paymentType='parcelado' AND installments=(SELECT parcelas FROM loanInstallmentPlans WHERE id=${input.id})`);
    if (parseInt(used[0]?.cnt || '0') > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir: já utilizado em empréstimos.' });
    await db.execute(drizzleSql`DELETE FROM loanInstallmentPlans WHERE id=${input.id}`);
    return { ok: true };
  }),

  // ── SIMULAR PARCELADO (público, sem expor juros) ───────────────────────────────────────────
  simulateParcelado: publicProcedure.input(z.object({
    token: z.string(),
    amount: z.number().positive(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    await ensureInstallmentPlansTable(db);
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${input.token.trim()}`);
    if (!clients.length) throw new TRPCError({ code: 'UNAUTHORIZED' });
    const client = clients[0];
    const allowed = (client.allowedPaymentTypes || '').split(',').map((t: string) => t.trim());
    if (!allowed.includes('parcelado')) throw new TRPCError({ code: 'FORBIDDEN', message: 'Parcelado não liberado para este cliente' });
    if (input.amount > parseFloat(client.creditLimit)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Valor excede seu limite de R$ ${parseFloat(client.creditLimit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
    const plans = await qRows(db, drizzleSql`SELECT parcelas, percentual FROM loanInstallmentPlans WHERE ativo=1 ORDER BY ordem ASC, parcelas ASC`);
    // Retornar apenas valores finais — sem percentual
    const opcoes = plans.map((p: any) => {
      const pct = parseFloat(p.percentual);
      const total = Math.round(input.amount * (1 + pct / 100) * 100) / 100;
      const parcela = Math.round((total / parseInt(p.parcelas)) * 100) / 100;
      return { parcelas: parseInt(p.parcelas), valorParcela: parcela, valorTotal: total };
    });
    return { opcoes };
  }),

  // ── SIMULAR PARCELADO ADM (com percentual) ───────────────────────────────────────────────
  simulateParceladoAdmin: adminProcedure.input(z.object({
    amount: z.number().positive(),
    parcelas: z.number().int().min(1),
    releaseDate: z.string(),
    frequencia: z.enum(['mensal', 'quinzenal', 'semanal']).default('mensal'),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await ensureInstallmentPlansTable(db);
    const plan = await qRows(db, drizzleSql`SELECT * FROM loanInstallmentPlans WHERE parcelas=${input.parcelas} AND ativo=1 LIMIT 1`);
    if (!plan.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plano não encontrado' });
    const pct = parseFloat(plan[0].percentual);
    const valorJuros = Math.round(input.amount * (pct / 100) * 100) / 100;
    const total = Math.round((input.amount + valorJuros) * 100) / 100;
    const parcela = Math.round((total / input.parcelas) * 100) / 100;
    // Gerar datas das parcelas
    const schedule = generateInstallments(input.releaseDate, input.frequencia === 'mensal' ? 'mensal' : input.frequencia === 'quinzenal' ? 'quinzenal' : 'semanal', input.parcelas, total);
    return {
      valorLiberado: input.amount,
      parcelas: input.parcelas,
      percentualJuros: pct,
      valorJuros,
      valorTotal: total,
      valorParcela: parcela,
      frequencia: input.frequencia,
      schedule,
    };
  }),

  // ── SOLICITAR PARCELADO (cliente) ──────────────────────────────────────────────────────────────
  requestParcelado: publicProcedure.input(z.object({
    token: z.string(),
    amount: z.number().positive(),
    parcelas: z.number().int().min(1),
    frequencia: z.enum(['mensal', 'quinzenal', 'semanal']).default('mensal'),
    primeiroVencimento: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    await ensureInstallmentPlansTable(db);
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${input.token.trim()}`);
    if (!clients.length) throw new TRPCError({ code: 'UNAUTHORIZED' });
    const client = clients[0];
    if (!client.client_pix_key || !client.client_pix_name || !client.client_pix_bank) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cadastre sua chave PIX completa antes de solicitar.' });
    }
    const allowed = (client.allowedPaymentTypes || '').split(',').map((t: string) => t.trim());
    if (!allowed.includes('parcelado')) throw new TRPCError({ code: 'FORBIDDEN', message: 'Parcelado não liberado para este cliente' });
    if (input.amount > parseFloat(client.creditLimit)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor excede seu limite.' });
    const plan = await qRows(db, drizzleSql`SELECT * FROM loanInstallmentPlans WHERE parcelas=${input.parcelas} AND ativo=1 LIMIT 1`);
    if (!plan.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plano de parcelamento não encontrado.' });
    const pct = parseFloat(plan[0].percentual);
    const valorJuros = Math.round(input.amount * (pct / 100) * 100) / 100;
    const total = Math.round((input.amount + valorJuros) * 100) / 100;
    const today = getBrazilToday();
    // Parcelado é sempre mensal — data de liberação definida pelo ADM após aprovação
    const schedule = generateInstallments(today, 'mensal', input.parcelas, total);
    const dueDate = schedule[schedule.length - 1].dueDate;
    try {
      const result = await db.execute(drizzleSql`
        INSERT INTO loans (userId, clientId, amount, interestRate, days, paymentType, installments,
          interestAmount, totalAmount, dueDate, status, notes, workDays)
        VALUES (1, ${client.id}, ${input.amount}, ${pct}, ${input.parcelas},
          'parcelado', ${input.parcelas}, ${valorJuros}, ${total},
          ${dueDate}, 'pendente', ${null}, 'seg_dom')
      `);
      const loanId = (result[0] as any).insertId;
      for (const inst of schedule) {
        await db.execute(drizzleSql`INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount) VALUES (${loanId}, ${inst.installmentNumber}, ${inst.dueDate}, ${inst.amount})`);
      }
      return { id: loanId, parcelas: input.parcelas, valorParcela: Math.round((total / input.parcelas) * 100) / 100, valorTotal: total, primeiroVencimento: schedule[0].dueDate };
    } catch (err: any) {
      console.error('[requestParcelado] DB error:', err?.message || err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao registrar empréstimo: ' + (err?.message || 'erro desconhecido') });
    }
  }),

  searchMainCustomer: adminProcedure.input(z.object({
    query: z.string().min(2),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    const q = `%${input.query}%`;
    const qNum = `%${input.query.replace(/\D/g, '')}%`;
    const rows = await qRows(db, drizzleSql`
      SELECT id, name, phone, cpf, email FROM customers
      WHERE (phone LIKE ${qNum} OR cpf LIKE ${qNum} OR name LIKE ${q})
      AND deletedAt IS NULL AND blocked=0
      LIMIT 10
    `);
    return rows;
  }),

  // ââ€â‚¬ââ€â‚¬ PIX CONFIG ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  getPixConfig: adminProcedure.query(async () => {
    const db = await getDb() as any;
    return await qRows(db, drizzleSql`SELECT * FROM loanPixConfig ORDER BY isActive DESC, id DESC LIMIT 10`);
  }),

  savePixConfig: adminProcedure.input(z.object({
    id: z.number().optional(),
    pixKey: z.string().min(1),
    pixKeyType: z.enum(["cpf", "cnpj", "telefone", "email", "aleatoria"]),
    pixName: z.string().min(1),
    bankName: z.string().optional(),
    isActive: z.number().default(1),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    if (input.id) {
      await db.execute(drizzleSql`UPDATE loanPixConfig SET pixKey=${input.pixKey}, pixKeyType=${input.pixKeyType}, pixName=${input.pixName}, bankName=${input.bankName || null}, isActive=${input.isActive}, updatedAt=NOW() WHERE id=${input.id}`);
    } else {
      await db.execute(drizzleSql`INSERT INTO loanPixConfig (pixKey, pixKeyType, pixName, bankName, isActive) VALUES (${input.pixKey}, ${input.pixKeyType}, ${input.pixName}, ${input.bankName || null}, ${input.isActive})`);
    }
    return { ok: true };
  }),

  deletePixConfig: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`DELETE FROM loanPixConfig WHERE id=${input.id}`);
    return { ok: true };
  }),

  // ââ€â‚¬ââ€â‚¬ PERFIS ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listProfiles: adminProcedure.query(async () => {
    const db = await getDb() as any;
    return await qRows(db, drizzleSql`SELECT * FROM loanProfiles ORDER BY sortOrder ASC`);
  }),

  saveProfile: adminProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    slug: z.string().min(1),
    creditLimit: z.number(),
    interestRate: z.number(),
    maxDays: z.number(),
    maxDaysSemanal: z.number().default(60),
    maxDaysQuinzenal: z.number().default(60),
    maxDaysMensal: z.number().default(90),
    isActive: z.number().default(1),
    sortOrder: z.number().default(0),
    defaultPaymentTypes: z.string().default("diario"),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const dpt = input.defaultPaymentTypes || "diario";
    const mds = input.maxDaysSemanal || 60;
    const mdq = input.maxDaysQuinzenal || 60;
    const mdm = input.maxDaysMensal || 90;
    if (input.id) {
      await db.execute(drizzleSql`UPDATE loanProfiles SET name=${input.name}, creditLimit=${input.creditLimit}, interestRate=${input.interestRate}, maxDays=${input.maxDays}, maxDaysSemanal=${mds}, maxDaysQuinzenal=${mdq}, maxDaysMensal=${mdm}, isActive=${input.isActive}, sortOrder=${input.sortOrder}, defaultPaymentTypes=${dpt}, updatedAt=NOW() WHERE id=${input.id}`);
    } else {
      await db.execute(drizzleSql`INSERT INTO loanProfiles (name, slug, creditLimit, interestRate, maxDays, maxDaysSemanal, maxDaysQuinzenal, maxDaysMensal, isActive, sortOrder, defaultPaymentTypes) VALUES (${input.name}, ${input.slug}, ${input.creditLimit}, ${input.interestRate}, ${input.maxDays}, ${mds}, ${mdq}, ${mdm}, ${input.isActive}, ${input.sortOrder}, ${dpt})`);
    }
    return { ok: true };
  }),

  // Sincroniza todos os clientes de um perfil com os valores atuais do perfil
  syncProfile: adminProcedure.input(z.object({
    profileSlug: z.string().min(1),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const profiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE slug=${input.profileSlug} LIMIT 1`);
    if (!profiles.length) throw new Error("Perfil não encontrado");
    const p = profiles[0];
    await db.execute(drizzleSql`
      UPDATE loanClients
      SET creditLimit=${p.creditLimit}, interestRate=${p.interestRate}, maxDays=${p.maxDays}, maxDaysSemanal=${p.maxDaysSemanal || 60}, maxDaysQuinzenal=${p.maxDaysQuinzenal || 60}, maxDaysMensal=${p.maxDaysMensal || 90}, updatedAt=NOW()
      WHERE profileSlug=${input.profileSlug}
    `);
    const updated = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanClients WHERE profileSlug=${input.profileSlug}`);
    return { ok: true, count: Number(updated[0]?.cnt || 0) };
  }),

  // ââ€â‚¬ââ€â‚¬ CLIENTES (admin) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listClients: adminProcedure.input(z.object({
    search: z.string().optional(),
    status: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb() as any;
    const searchVal = input?.search ? `%${input.search}%` : null;
    const statusVal = input?.status || null;

    let rows: any[];
    if (searchVal && statusVal) {
      rows = await qRows(db, drizzleSql`
        SELECT lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt,
          COALESCE(lc.cpf, MAX(c.cpf)) as cpf,
          MAX(c.profilePhotoUrl) as profilePhotoUrl,
          COUNT(DISTINCT l.id) as totalLoans,
          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount
        FROM loanClients lc
        LEFT JOIN loans l ON l.clientId = lc.id
        LEFT JOIN customers c ON c.phone = lc.phone AND c.deletedAt IS NULL
        WHERE (lc.name LIKE ${searchVal} OR lc.cpf LIKE ${searchVal} OR lc.phone LIKE ${searchVal})
          AND lc.status = ${statusVal}
        GROUP BY lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt ORDER BY lc.name ASC
      `);
    } else if (searchVal) {
      rows = await qRows(db, drizzleSql`
        SELECT lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt,
          COALESCE(lc.cpf, MAX(c.cpf)) as cpf,
          MAX(c.profilePhotoUrl) as profilePhotoUrl,
          COUNT(DISTINCT l.id) as totalLoans,
          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount
        FROM loanClients lc
        LEFT JOIN loans l ON l.clientId = lc.id
        LEFT JOIN customers c ON c.phone = lc.phone AND c.deletedAt IS NULL
        WHERE (lc.name LIKE ${searchVal} OR lc.cpf LIKE ${searchVal} OR lc.phone LIKE ${searchVal})
        GROUP BY lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt ORDER BY lc.name ASC
      `);
    } else if (statusVal) {
      rows = await qRows(db, drizzleSql`
        SELECT lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt,
          COALESCE(lc.cpf, MAX(c.cpf)) as cpf,
          MAX(c.profilePhotoUrl) as profilePhotoUrl,
          COUNT(DISTINCT l.id) as totalLoans,
          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount
        FROM loanClients lc
        LEFT JOIN loans l ON l.clientId = lc.id
        LEFT JOIN customers c ON c.phone = lc.phone AND c.deletedAt IS NULL
        WHERE lc.status = ${statusVal}
        GROUP BY lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt ORDER BY lc.name ASC
      `);
    } else {
      rows = await qRows(db, drizzleSql`
        SELECT lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt,
          COALESCE(lc.cpf, MAX(c.cpf)) as cpf,
          MAX(c.profilePhotoUrl) as profilePhotoUrl,
          COUNT(DISTINCT l.id) as totalLoans,
          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount
        FROM loanClients lc
        LEFT JOIN loans l ON l.clientId = lc.id
        LEFT JOIN customers c ON c.phone = lc.phone AND c.deletedAt IS NULL
        GROUP BY lc.id, lc.userId, lc.name, lc.phone, lc.status, lc.profileSlug, lc.creditLimit, lc.interestRate, lc.maxDays, lc.maxDaysSemanal, lc.maxDaysQuinzenal, lc.maxDaysMensal, lc.notes, lc.loanEnabled, lc.pixKey, lc.pixKeyType, lc.pixName, lc.spreadsheetToken, lc.allowedPaymentTypes, lc.late_fee_disabled, lc.client_pix_key, lc.client_pix_name, lc.client_pix_bank, lc.createdAt, lc.updatedAt ORDER BY lc.name ASC
      `);
    }
    return rows;
  }),

  getClient: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE id=${input.id}`);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),

  saveClient: adminProcedure.input(z.object({
    id: z.number().optional(),
    customerId: z.number().optional(),
    name: z.string().min(1),
    cpf: z.string().optional(),
    phone: z.string().optional(),
    status: z.enum(["ativo", "bloqueado", "inadimplente"]).default("ativo"),
    profileSlug: z.string().default("bronze"),
    creditLimit: z.number(),
    interestRate: z.number(),
    loanEnabled: z.number().default(0),
    allowedPaymentTypes: z.string().optional(), // será derivado do perfil se não informado
    pixKey: z.string().optional(),
    pixKeyType: z.enum(["cpf", "cnpj", "telefone", "email", "aleatoria"]).optional(),
    pixName: z.string().optional(),
    spreadsheetToken: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;

    // O perfil fornece modos somente para novos clientes. Em edição, uma lista
    // individual já gravada não pode ser substituída por mudança de perfil.
    const profiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE slug=${input.profileSlug} LIMIT 1`);
    const profile = profiles[0];
    let resolvedAllowedTypes = String(input.allowedPaymentTypes || '').trim();
    if (!resolvedAllowedTypes && input.id) {
      const existing = await qRows(db, drizzleSql`SELECT allowedPaymentTypes FROM loanClients WHERE id=${input.id} LIMIT 1`);
      resolvedAllowedTypes = String(existing[0]?.allowedPaymentTypes || '').trim();
    }
    if (!resolvedAllowedTypes) resolvedAllowedTypes = profile?.defaultPaymentTypes ?? "diario";

    if (input.id) {
      await db.execute(drizzleSql`
        UPDATE loanClients SET
          name=${input.name}, cpf=${input.cpf || null}, phone=${input.phone || null},
          status=${input.status}, profileSlug=${input.profileSlug},
          creditLimit=${input.creditLimit}, interestRate=${input.interestRate},
          loanEnabled=${input.loanEnabled}, allowedPaymentTypes=${resolvedAllowedTypes},
          pixKey=${input.pixKey || null}, pixKeyType=${input.pixKeyType || null},
          pixName=${input.pixName || null},
          client_pix_key=${input.pixKey || null}, client_pix_name=${input.pixName || null},
          spreadsheetToken=${input.spreadsheetToken || null},
          notes=${input.notes || null}, updatedAt=NOW()
        WHERE id=${input.id}
      `);
      try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
        console.warn('[loans.saveClient] sincronização unificada não aplicada:', error?.message);
      }
      return { id: input.id };
    } else {
      let mainCustomer: any;
      try {
        mainCustomer = await requireCompleteMainCustomerProfile(db, { phone: input.phone, cpf: input.cpf });
      } catch (profileError: any) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: profileError?.message || 'Conclua o cadastro principal antes de habilitar empréstimos.' });
      }
      const result = await db.execute(drizzleSql`
        INSERT INTO loanClients (name, cpf, phone, status, profileSlug, creditLimit, interestRate,
          loanEnabled, allowedPaymentTypes, pixKey, pixKeyType, pixName, client_pix_key, client_pix_name, spreadsheetToken, notes, userId)
        VALUES (${mainCustomer.name}, ${mainCustomer.cpf || null}, ${mainCustomer.phone || null}, ${input.status},
          ${input.profileSlug}, ${input.creditLimit}, ${input.interestRate}, ${input.loanEnabled},
          ${resolvedAllowedTypes}, ${input.pixKey || null}, ${input.pixKeyType || null},
          ${input.pixName || null}, ${input.pixKey || null}, ${input.pixName || null}, ${input.spreadsheetToken || null}, ${input.notes || null}, 1)
      `);
      try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
        console.warn('[loans.saveClient] sincronização unificada não aplicada:', error?.message);
      }
      return { id: (result[0] as any).insertId };
    }
  }),

  toggleLoanEnabled: adminProcedure.input(z.object({
    clientId: z.number(),
    enabled: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`UPDATE loanClients SET loanEnabled=${input.enabled}, updatedAt=NOW() WHERE id=${input.clientId}`);
    return { ok: true };
  }),

  deleteClient: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`DELETE FROM loanInstallments WHERE loanId IN (SELECT id FROM loans WHERE clientId=${input.id})`);
    await db.execute(drizzleSql`DELETE FROM loans WHERE clientId=${input.id}`);
    await db.execute(drizzleSql`DELETE FROM loanClients WHERE id=${input.id}`);
    return { ok: true };
  }),

  // ââ€â‚¬ââ€â‚¬ EMPRÉSTIMOS (admin) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listLoans: adminProcedure.input(z.object({
    clientId: z.number().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb() as any;
    await ensurePixDisbursementColumns(db);
    await ensureClientPixFieldsSynced(db);
    await getLoanH2ScoreConfig(db);
    const searchVal = input?.search ? `%${input.search}%` : null;
    const clientId = input?.clientId || null;

    const baseSelect = drizzleSql`
      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf,
        lc.loanEnabled, lc.status as clientStatus, lc.profileSlug as clientProfile,
        COALESCE(NULLIF(lc.client_pix_key, ''), NULLIF(lc.pixKey, '')) as clientPixKey,
        COALESCE(NULLIF(lc.client_pix_name, ''), NULLIF(lc.pixName, '')) as clientPixName,
        lc.client_pix_bank as clientPixBank,
        c.id as customerId, c.profilePhotoUrl as clientPhoto, c.cpf as customerCpf, c.email as clientEmail,
        lp.defaultPaymentTypes as profileAllowedModes,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='em_analise') as pendingProofs,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pago') as paidInstallments,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id) as totalInstallments,
        (SELECT COALESCE(SUM(amount), 0) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < DATE(DATE_SUB(NOW(), INTERVAL 3 HOUR))) as overdueAmount,
        (SELECT COALESCE(SUM(COALESCE(feeApplied, 0)), 0) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < DATE(DATE_SUB(NOW(), INTERVAL 3 HOUR))) as overdueFees,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < DATE(DATE_SUB(NOW(), INTERVAL 3 HOUR))) as overdueCount,
        (SELECT COALESCE(SUM(paidAmount), 0) FROM loanInstallments WHERE loanId=l.id AND status='pago_juros') as interestOnlyPaidTotal,
        (SELECT COALESCE(SUM(points), 0) FROM loanH2ScoreLedger WHERE clientId=l.clientId) as h2ScoreTotal
      FROM loans l
      JOIN loanClients lc ON lc.id = l.clientId
      LEFT JOIN customers c ON c.phone = lc.phone
      LEFT JOIN loanProfiles lp ON lp.slug = lc.profileSlug
    `;

    let rows: any[];
    if (clientId && searchVal) {
      rows = await qRows(db, drizzleSql`${baseSelect}
        WHERE l.clientId=${clientId}
          AND (lc.name LIKE ${searchVal} OR lc.phone LIKE ${searchVal} OR lc.cpf LIKE ${searchVal})
        ORDER BY l.createdAt DESC`);
    } else if (clientId) {
      rows = await qRows(db, drizzleSql`${baseSelect}
        WHERE l.clientId=${clientId}
        ORDER BY l.createdAt DESC`);
    } else if (searchVal) {
      rows = await qRows(db, drizzleSql`${baseSelect}
        WHERE (lc.name LIKE ${searchVal} OR lc.phone LIKE ${searchVal} OR lc.cpf LIKE ${searchVal})
        ORDER BY l.createdAt DESC`);
    } else {
      rows = await qRows(db, drizzleSql`${baseSelect} ORDER BY l.createdAt DESC`);
    }

    // Garante que cada card leia a chave do próprio cadastro ou de um cadastro
    // equivalente do mesmo CPF/telefone, inclusive para dados antigos já existentes.
    const pixClients = await qRows(db, drizzleSql`
      SELECT id, cpf, phone, pixKey, pixName, client_pix_key, client_pix_name, client_pix_bank, updatedAt
      FROM loanClients
    `);
    rows = rows.map((loan: any) => {
      const pixSource = resolvePixSource(loan, pixClients);
      if (!pixSource) return loan;
      return {
        ...loan,
        clientPixKey: pixKeyOf(pixSource),
        clientPixName: pixNameOf(pixSource),
        clientPixBank: pixBankOf(pixSource) || loan.clientPixBank || '',
      };
    });

    // O H2 Score pertence ao cadastro principal. Cada card recebe o mesmo resumo permanente,
    // inclusive saldo, nível, próximo nível e últimos lançamentos auditáveis.
    const h2Summaries = new Map<number, any>();
    for (const loan of rows) {
      const customerIdForScore = Number(loan.customerId || 0);
      if (!customerIdForScore || h2Summaries.has(customerIdForScore)) continue;
      try {
        const summary = await getCustomerH2ScoreSummary(db, customerIdForScore, Number(loan.clientId || 0) || null);
        h2Summaries.set(customerIdForScore, {
          totalPoints: Number(summary.account?.totalPoints || 0),
          level: summary.level,
          currentCommercialProfile: summary.currentCommercialProfile,
          events: (summary.events || []).slice(0, 5).map((event: any) => ({
            id: event.id,
            eventType: event.eventType,
            scoreBand: event.scoreBand,
            pointsBefore: Number(event.pointsBefore || 0),
            pointsChange: Number(event.pointsChange || 0),
            pointsAfter: Number(event.pointsAfter || 0),
            reason: event.reason,
            createdBy: event.createdBy,
            createdAt: event.createdAt,
            installmentNumber: event.installmentNumber,
          })),
        });
      } catch (error) {
        console.error('[Loans] Failed to load permanent H2 Score summary', { loanId: loan.id, customerId: customerIdForScore, error });
      }
    }
    rows = rows.map((loan: any) => ({
      ...loan,
      h2ScoreDetail: h2Summaries.get(Number(loan.customerId || 0)) || null,
    }));

    const today = getBrazilToday();
    // Busca parcelas que vencem hoje para cada empréstimo aprovado
    const todayDueLoans = await qRows(db, drizzleSql`
      SELECT DISTINCT loanId FROM loanInstallments
      WHERE dueDate=${today} AND status='pendente'
    `);
    const todayDueLoanIds = new Set(todayDueLoans.map((r: any) => r.loanId));
    // Busca empréstimos que têm QUALQUER parcela pendente com vencimento anterior a hoje
    const overdueLoans = await qRows(db, drizzleSql`
      SELECT DISTINCT loanId FROM loanInstallments
      WHERE dueDate < ${today} AND status IN ('pendente','atrasado')
    `);
    const overdueLoanIds = new Set(overdueLoans.map((r: any) => r.loanId));
    let result = rows.map((r: any) => ({
      ...r,
      isOverdue: !['pago', 'cancelado', 'reprovado'].includes(r.status) && overdueLoanIds.has(r.id),
      hasInstallmentDueToday: todayDueLoanIds.has(r.id) && !['pago', 'cancelado', 'reprovado'].includes(r.status),
    }));
    if (input?.status && input.status !== 'todos') {
      if (input.status === 'solicitacoes_novas') {
        // Solicitação ainda em análise ou aprovada, porém sem confirmação do PIX de liberação.
        result = result.filter((r: any) => r.status === 'pendente' || (r.status === 'aprovado' && !r.pixSentAt));
      } else if (input.status === 'ativos') {
        // Só entra na cobrança normal após o ADM confirmar que o PIX de liberação foi enviado.
        result = result.filter((r: any) => !['pago', 'cancelado', 'reprovado', 'pendente'].includes(r.status) && !(r.status === 'aprovado' && !r.pixSentAt));
      } else if (input.status === 'finalizados') {
        // Aba Finalizados: pago, cancelado ou reprovado
        result = result.filter((r: any) => ['pago', 'cancelado', 'reprovado'].includes(r.status));
      } else if (input.status === 'atrasado') {
        result = result.filter((r: any) => r.isOverdue);
      } else if (input.status === 'aguardando_pagamento') {
        // Inclui empréstimos com status aguardando_pagamento OU aprovado com parcela vencendo hoje
        result = result.filter((r: any) => r.status === 'aguardando_pagamento' || r.hasInstallmentDueToday);
      } else if (input.status === 'em_analise') {
        // Empréstimos que têm pelo menos uma parcela em análise (comprovante enviado pelo cliente)
        result = result.filter((r: any) => Number(r.pendingProofs) > 0);
      } else if (input.status === 'pix_pendente') {
        // Mantido para compatibilidade: mostra somente os aprovados sem PIX de liberação confirmado.
        result = result.filter((r: any) => r.status === 'aprovado' && !r.pixSentAt);
      } else if (input.status === 'aprovado') {
        // Aprovados que já tiveram o PIX de liberação confirmado pelo ADM.
        result = result.filter((r: any) => r.status === 'aprovado' && !!r.pixSentAt);
      } else if (input.status === 'pago_hoje') {
        // Empréstimos com pelo menos uma parcela paga hoje (convertendo paidAt para BRT)
        const pagoHojeRows = await qRows(db, drizzleSql`
          SELECT DISTINCT loanId FROM loanInstallments
          WHERE status='pago' AND DATE(CONVERT_TZ(paidAt, '+00:00', '-03:00'))=${today}
        `);
        const pagoHojeLoanIds = new Set(pagoHojeRows.map((r: any) => r.loanId));
        result = result.filter((r: any) => pagoHojeLoanIds.has(r.id));
      } else {
        result = result.filter((r: any) => r.status === input.status);
      }
    }
    return result;
  }),

  getH2ScoreConfig: adminProcedure.query(async () => {
    const db = await getDb() as any;
    await backfillLegacyH2ScoreEvents(db);
    return await getLoanH2ScoreConfig(db);
  }),

  saveH2ScoreConfig: adminProcedure.input(z.object({
    onTimePoints: z.number().int().min(-100).max(100),
    eveningPoints: z.number().int().min(-100).max(100),
    nightPoints: z.number().int().min(-100).max(100),
    afterDuePoints: z.number().int().min(-100).max(100),
    initialPoints: z.number().int().min(0).max(100),
    bronzeMin: z.number().int().min(0).max(100),
    prataMin: z.number().int().min(0).max(100),
    ouroMin: z.number().int().min(0).max(100),
    diamanteMin: z.number().int().min(0).max(100),
  }).refine((values) => values.bronzeMin < values.prataMin && values.prataMin < values.ouroMin && values.ouroMin < values.diamanteMin, {
    message: 'As faixas devem seguir Bronze < Prata < Ouro < Diamante.',
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await getLoanH2ScoreConfig(db);
    await db.execute(drizzleSql`
      UPDATE loanH2ScoreConfig
      SET onTimePoints=${input.onTimePoints}, eveningPoints=${input.eveningPoints},
          nightPoints=${input.nightPoints}, afterDuePoints=${input.afterDuePoints},
          initialPoints=${input.initialPoints}, bronzeMin=${input.bronzeMin}, prataMin=${input.prataMin},
          ouroMin=${input.ouroMin}, diamanteMin=${input.diamanteMin}
      WHERE id=1
    `);
    return await getLoanH2ScoreConfig(db);
  }),

  getH2ScoreCustomerDirectory: adminProcedure.query(async () => {
    const db = await getDb() as any;
    await backfillLegacyH2ScoreEvents(db);
    return await getH2ScoreCustomerDirectory(db);
  }),

  getLoan: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`
      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf
      FROM loans l JOIN loanClients lc ON lc.id = l.clientId WHERE l.id=${input.id}
    `);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    const today = getBrazilToday();
    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.id} ORDER BY installmentNumber ASC`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const instRows = rawInstallments.map((i: any) => ({
      ...i,
      h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
      isOverdue: !['pago', 'cancelado', 'reprovado', 'em_analise'].includes(i.status) && i.dueDate < today,
    }));
    const h2Score = await getClientH2ScoreSummary(db, [Number(rows[0].clientId)]);
    return { ...rows[0], installments: instRows, h2Score };
  }),

  createLoan: adminProcedure.input(z.object({
    clientId: z.number(),
    amount: z.number().positive(),
    interestRate: z.number().min(0),
    days: z.number().positive(),
    paymentType: z.enum(["diario", "semanal", "mensal", "quinzenal"]),
    workDays: z.enum(["seg_sab", "seg_dom", "custom"]).default("seg_sab"),
    customInstallments: z.number().min(1).max(365).optional(),
    releaseDate: z.string(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE id=${input.clientId}`);
    if (!clients.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
    const client = clients[0];
    if (client.status === "bloqueado") throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente bloqueado" });

    // Valida se o modo de pagamento está liberado para este cliente (regra do perfil)
    const allowedTypes = (client.allowedPaymentTypes || "diario").split(",").map((t: string) => t.trim());
    if (!allowedTypes.includes(input.paymentType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Modo de pagamento "${input.paymentType}" não liberado para este cliente. Modos permitidos: ${allowedTypes.join(", ")}` });
    }

    // Valida se o valor não excede o limite do cliente
    if (input.amount > parseFloat(client.creditLimit)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Valor R$ ${input.amount} excede o limite do cliente de R$ ${parseFloat(client.creditLimit).toFixed(2)}` });
    }

    const interestAmount = Math.round(input.amount * (input.interestRate / 100) * 100) / 100;
    const totalAmount = Math.round((input.amount + interestAmount) * 100) / 100;
    // Usa simulateLoan para calcular parcelas com o regime correto (seg_sab pula domingo, custom = n definido)
    const sim = simulateLoan(input.amount, input.interestRate, input.paymentType, input.days, input.workDays, input.releaseDate, input.customInstallments);
    const installmentList = sim.schedule;
    const dueDate = installmentList[installmentList.length - 1].dueDate;

    const result = await db.execute(drizzleSql`
      INSERT INTO loans (userId, clientId, amount, interestRate, days, paymentType, installments,
        interestAmount, totalAmount, releaseDate, dueDate, status, notes, workDays)
      VALUES (1, ${input.clientId}, ${input.amount}, ${input.interestRate}, ${input.days},
        ${input.paymentType}, ${sim.installments}, ${interestAmount}, ${totalAmount},
        ${input.releaseDate}, ${dueDate}, 'pendente', ${input.notes || null}, ${input.workDays})
    `);
    const loanId = (result[0] as any).insertId;
    for (const inst of installmentList) {
      await db.execute(drizzleSql`INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount) VALUES (${loanId}, ${inst.installmentNumber}, ${inst.dueDate}, ${inst.amount})`);
    }
    return { id: loanId, totalAmount: sim.totalAmount, installments: sim.installments, perInstallment: sim.perInstallment };
  }),

  approveLoan: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const approvedBy = ctx.user?.name || "admin";
    await db.execute(drizzleSql`UPDATE loans SET status='aprovado', approvedAt=NOW(), approvedBy=${approvedBy} WHERE id=${input.id}`);
    return { ok: true };
  }),

  confirmPixSent: adminProcedure.input(z.object({
    id: z.number(),
    // Data que o ADM declara como a confirmação do PIX. Em branco = hoje.
    confirmedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(1000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    await ensurePixDisbursementColumns(db);
    await ensureClientPixFieldsSynced(db);
    const rows = await qRows(db, drizzleSql`
      SELECT l.id, l.clientId, l.status, l.pixSentAt,
        lc.cpf as clientCpf, lc.phone as clientPhone,
        COALESCE(NULLIF(lc.client_pix_key, ''), NULLIF(lc.pixKey, '')) as clientPixKey
      FROM loans l JOIN loanClients lc ON lc.id=l.clientId
      WHERE l.id=${input.id} LIMIT 1
    `);
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    const loan = rows[0];
    const pixClients = await qRows(db, drizzleSql`
      SELECT id, cpf, phone, pixKey, pixName, client_pix_key, client_pix_name, client_pix_bank, updatedAt
      FROM loanClients
    `);
    const pixSource = resolvePixSource(loan, pixClients);
    const clientPixKey = pixKeyOf(pixSource) || String(loan.clientPixKey || '').trim();
    if (loan.status !== 'aprovado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'A liberação só pode ser confirmada após a aprovação.' });
    if (!clientPixKey) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cadastre a chave PIX do cliente antes de confirmar a liberação.' });
    if (loan.pixSentAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este PIX já foi confirmado como enviado.' });
    const sentBy = ctx.user?.name || 'admin';
    const confirmedDate = input.confirmedDate || getBrazilToday();
    await db.execute(drizzleSql`
      UPDATE loans SET pixSentAt=NOW(), pixConfirmedDate=${confirmedDate}, pixSentBy=${sentBy}, pixSendNote=${input.note?.trim() || null}, updatedAt=NOW()
      WHERE id=${input.id}
    `);
    return { ok: true, confirmedDate };
  }),

  updatePixConfirmedDate: adminProcedure.input(z.object({
    id: z.number(),
    confirmedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await ensurePixDisbursementColumns(db);
    const rows = await qRows(db, drizzleSql`SELECT pixSentAt FROM loans WHERE id=${input.id} LIMIT 1`);
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    if (!rows[0].pixSentAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Confirme o PIX enviado antes de editar a data.' });
    await db.execute(drizzleSql`UPDATE loans SET pixConfirmedDate=${input.confirmedDate}, updatedAt=NOW() WHERE id=${input.id}`);
    return { ok: true };
  }),

  rejectLoan: adminProcedure.input(z.object({
    id: z.number(),
    reason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const rejectedBy = ctx.user?.name || "admin";
    const reason = input.reason || null;
    await db.execute(drizzleSql`UPDATE loans SET status='reprovado', rejectedAt=NOW(), rejectedBy=${rejectedBy}, rejectedReason=${reason} WHERE id=${input.id}`);
    return { ok: true };
  }),

  sendRejectionNotice: adminProcedure.input(z.object({
    loanId: z.number(),
    reason: z.string().min(1),
    emailOverride: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    // Buscar dados do empréstimo e cliente
    const loanRows = await qRows(db, drizzleSql`
      SELECT l.amount, l.totalAmount, l.paymentType, l.installments, l.releaseDate,
        lc.name as clientName, lc.phone as clientPhone
      FROM loans l
      JOIN loanClients lc ON lc.id = l.clientId
      WHERE l.id=${input.loanId}
    `);
    if (!loanRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    const loan = loanRows[0];
    // Buscar e-mail do cliente na tabela customers pelo telefone
    let clientEmail = input.emailOverride || null;
    if (!clientEmail && loan.clientPhone) {
      const custRows = await qRows(db, drizzleSql`SELECT email FROM customers WHERE phone=${loan.clientPhone} AND deletedAt IS NULL LIMIT 1`);
      if (custRows.length && custRows[0].email) clientEmail = custRows[0].email;
    }
    let sentTo: string | null = null;
    if (clientEmail) {
      try {
        const amountFmt = parseFloat(loan.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        await transporter.sendMail({
          from: '"CSA Empréstimos SP" <h2@h2colombiano.com>',
          to: clientEmail,
          subject: `Atualização sobre sua solicitação de empréstimo ââ‚¬â€ CSA Empréstimos SP`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;">
              <h2 style="color:#ef4444;margin:0;">CSA Empréstimos SP</h2>
              <p style="color:#94a3b8;margin:4px 0 0;">Resultado da Análise de Crédito</p>
            </div>
            <div style="background:#f8fafc;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
              <p style="color:#0f172a;">Olá, <strong>${loan.clientName}</strong>!</p>
              <p style="color:#374151;">Informamos que sua solicitação de empréstimo no valor de <strong>${amountFmt}</strong> foi <strong style="color:#ef4444;">reprovada</strong>.</p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:16px 0;">
                <p style="color:#991b1b;font-weight:bold;margin:0 0 6px;">Motivo:</p>
                <p style="color:#7f1d1d;margin:0;">${input.reason}</p>
              </div>
              <p style="color:#374151;">Em caso de dúvidas, entre em contato conosco pelo WhatsApp.</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
              <p style="color:#6b7280;font-size:12px;">CSA Empréstimos SP ââ‚¬â€ Atendimento ao cliente</p>
            </div>
          </div>`,
        });
        sentTo = clientEmail;
      } catch (err: any) {
        console.error('[sendRejectionNotice] Erro ao enviar e-mail:', err?.message);
      }
    }
    // Retorna dados para o frontend montar o link do WhatsApp
    const phone = loan.clientPhone ? loan.clientPhone.replace(/\D/g, '') : null;
    const waMsg = `Olá ${loan.clientName}! Infelizmente sua solicitação de empréstimo foi reprovada.\n\nMotivo: ${input.reason}\n\nEm caso de dúvidas, entre em contato conosco.`;
    const whatsappUrl = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(waMsg)}` : null;
    return { ok: true, sentTo, whatsappUrl, clientPhone: loan.clientPhone, clientName: loan.clientName };
  }),

  deleteLoan: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`DELETE FROM loanInstallments WHERE loanId=${input.id}`);
    await db.execute(drizzleSql`DELETE FROM loans WHERE id=${input.id}`);
    return { ok: true };
  }),

  confirmInstallmentPayment: adminProcedure.input(z.object({
    installmentId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const paidBy = ctx.user?.name || "admin";
    await db.execute(drizzleSql`UPDATE loanInstallments SET status='pago', paidAt=NOW(), paidBy=${paidBy} WHERE id=${input.installmentId}`);
    const h2ScoreApproval = await approveH2ScoreSubmission(db, input.installmentId, paidBy);
    const permanentH2Score = h2ScoreApproval ? await applyH2ScoreEventFromSubmission(db, input.installmentId) : null;
    const inst = await qRows(db, drizzleSql`SELECT loanId FROM loanInstallments WHERE id=${input.installmentId}`);
    if (inst.length) {
      const loanId = inst[0].loanId;
      const pending = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=${loanId} AND status != 'pago'`);
      if (parseInt(pending[0].cnt) === 0) {
        // Todas as parcelas pagas ââ€ â€™ empréstimo pago
        await db.execute(drizzleSql`UPDATE loans SET status='pago', paidAt=NOW(), paidBy=${paidBy} WHERE id=${loanId}`);
      } else {
        // Ainda há parcelas pendentes ââ€ â€™ verificar se há alguma aguardando análise
        const awaitingProof = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=${loanId} AND status IN ('aguardando_confirmacao','em_analise')`);
        if (parseInt(awaitingProof[0].cnt) > 0) {
          // Ainda tem comprovante aguardando ââ€ â€™ mantém aguardando_pagamento
          await db.execute(drizzleSql`UPDATE loans SET status='aguardando_pagamento' WHERE id=${loanId}`);
        } else {
          // Nenhum comprovante pendente ââ€ â€™ volta para ativo/aprovado
          await db.execute(drizzleSql`UPDATE loans SET status='aprovado' WHERE id=${loanId} AND status='aguardando_pagamento'`);
        }
      }
    }
    return { ok: true, h2ScoreApproval, permanentH2Score };
  }),

  refuseInstallmentPayment: adminProcedure.input(z.object({
    installmentId: z.number(),
    reason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const refusedBy = ctx.user?.name || 'admin';
    await refuseH2ScoreSubmission(db, input.installmentId, refusedBy);
    await db.execute(drizzleSql`UPDATE loanInstallments SET status='pendente', proofUrl=NULL, proofSentAt=NULL WHERE id=${input.installmentId}`);
    return { ok: true };
  }),

  // Desfaz pagamento confirmado: volta para pendente, MANTÉM comprovante para consulta
  undoInstallmentPayment: adminProcedure.input(z.object({
    installmentId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const inst = await qRows(db, drizzleSql`SELECT loanId FROM loanInstallments WHERE id=${input.installmentId}`);
    if (!inst.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const loanId = inst[0].loanId;
    // Volta para pendente mas MANTÉM proofUrl e proofSentAt para consulta futura
    await db.execute(drizzleSql`UPDATE loanInstallments SET status='pendente', paidAt=NULL, paidBy=NULL WHERE id=${input.installmentId}`);
    // Se o empréstimo estava marcado como pago, volta para aprovado
    await db.execute(drizzleSql`UPDATE loans SET status='aprovado' WHERE id=${loanId} AND status='pago'`);
    return { ok: true };
  }),

  cancelLoan: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`UPDATE loans SET status='cancelado', updatedAt=NOW() WHERE id=${input.id}`);
    return { ok: true };
  }),

  // ââ€â‚¬ââ€â‚¬ DASHBOARD (admin) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  getDashboard: adminProcedure.query(async () => {
    const db = await getDb() as any;
    // Usar fuso horário de São Paulo (GMT-3) para calcular "hoje"
    const today = getBrazilToday();

    // Totais gerais dos empréstimos
    const totalsRows = await qRows(db, drizzleSql`
      SELECT
        COUNT(*) as totalLoans,
        COALESCE(SUM(amount),0) as totalLent,
        COUNT(CASE WHEN status NOT IN ('pago','cancelado','reprovado') THEN 1 END) as activeCount,
        COUNT(CASE WHEN status NOT IN ('pago','cancelado','reprovado') AND dueDate < ${today} THEN 1 END) as overdueCount
      FROM loans
    `);
    const totals = totalsRows[0] || {};

    // Total previsto = soma de TODAS as parcelas de empréstimos ativos (capital + juros)
    const expectedRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as totalExpected
      FROM loanInstallments li
      INNER JOIN loans l ON l.id = li.loanId
      WHERE l.status NOT IN ('cancelado','reprovado')
    `);
    const totalExpected = parseFloat(expectedRows[0]?.totalExpected || 0);

    // Total recebido = soma das parcelas individualmente pagas (independente do status do empréstimo)
    const receivedRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as totalReceived
      FROM loanInstallments li
      WHERE li.status = 'pago'
    `);
    const totalReceived = parseFloat(receivedRows[0]?.totalReceived || 0);

    // Valor em aberto = Total previsto - Total recebido
    const valorEmAberto = totalExpected - totalReceived;

    // Valor vencido = parcelas pendentes/atrasadas com vencimento passado
    const overdueInstRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as totalOverdue
      FROM loanInstallments li
      INNER JOIN loans l ON l.id = li.loanId
      WHERE li.status IN ('pendente','atrasado')
        AND li.dueDate < ${today}
        AND l.status NOT IN ('cancelado','reprovado')
    `);
    const totalOverdue = parseFloat(overdueInstRows[0]?.totalOverdue || 0);

    // Juros recebidos: proporcional ao valor pago em relação ao total do empréstimo
    const interestRows = await qRows(db, drizzleSql`
      SELECT
        COALESCE(SUM(
          l.interestAmount * (
            (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pago') /
            GREATEST((SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id), 1)
          )
        ), 0) as totalInterestReceived
      FROM loans l
      WHERE l.status NOT IN ('cancelado','reprovado')
    `);
    const totalInterestReceived = parseFloat(interestRows[0]?.totalInterestReceived || 0);

    const pendingRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loans WHERE status='pendente'`);
    const proofRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE status='em_analise'`);
    const inadRows = await qRows(db, drizzleSql`SELECT COUNT(DISTINCT li.loanId) as cnt FROM loanInstallments li INNER JOIN loans l ON l.id = li.loanId WHERE li.status IN ('pendente','atrasado') AND li.dueDate < ${today} AND l.status NOT IN ('cancelado','reprovado')`);

    // Lucro Total Previsto = interestAmount total de todos os empréstimos ativos
    const totalExpectedProfitRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(interestAmount), 0) as totalExpectedProfit
      FROM loans
      WHERE status NOT IN ('cancelado','reprovado')
    `);
    const totalExpectedProfit = parseFloat(totalExpectedProfitRows[0]?.totalExpectedProfit || 0);

    // Capital Recuperado = do total recebido, quanto é capital (não juros)
    const capitalRecoveredRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(
        l.amount * (
          (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pago') /
          GREATEST((SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id), 1)
        )
      ), 0) as capitalRecovered
      FROM loans l
      WHERE l.status NOT IN ('cancelado','reprovado')
    `);
    const capitalRecovered = parseFloat(capitalRecoveredRows[0]?.capitalRecovered || 0);

    // Rentabilidade = (totalExpectedProfit / totalLent) * 100
    const totalLentNum = parseFloat(totals.totalLent || 0);
    const rentabilidade = totalLentNum > 0 ? (totalExpectedProfit / totalLentNum) * 100 : 0;

    // Lucro a Receber = Lucro Total Previsto - Lucro Recebido (nunca negativo)
    const lucroAReceber = Math.max(0, totalExpectedProfit - totalInterestReceived);

    // A Receber Hoje = soma das parcelas pendentes com vencimento hoje
    const dueToday = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as totalDueToday
      FROM loanInstallments li
      INNER JOIN loans l ON l.id = li.loanId
      WHERE li.dueDate = ${today}
        AND li.status NOT IN ('pago')
        AND l.status NOT IN ('cancelado','reprovado')
    `);
    const totalDueToday = parseFloat(dueToday[0]?.totalDueToday || 0);

    // Recebido Hoje = soma das parcelas pagas hoje (considerando fuso BRT)
    const receivedToday = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as totalReceivedToday
      FROM loanInstallments li
      WHERE li.status = 'pago'
        AND DATE(DATE_SUB(li.paidAt, INTERVAL 3 HOUR)) = ${today}
    `);
    const totalReceivedToday = parseFloat(receivedToday[0]?.totalReceivedToday || 0);

    // Gráfico mensal: dois datasets separados
    // 1) Emprestado por mês de criação do empréstimo
    const lentByMonth = await qRows(db, drizzleSql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') as month, SUM(amount) as lent
      FROM loans
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month ASC
    `);
    // 2) Recebido por mês em que a parcela foi efetivamente paga
    const receivedByMonth = await qRows(db, drizzleSql`
      SELECT DATE_FORMAT(paidAt, '%Y-%m') as month, SUM(amount) as received
      FROM loanInstallments
      WHERE status = 'pago' AND paidAt IS NOT NULL AND paidAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month ASC
    `);
    // Mescla os dois datasets pelo mês
    const allMonths = Array.from(new Set([
      ...lentByMonth.map((r: any) => r.month),
      ...receivedByMonth.map((r: any) => r.month),
    ])).sort();
    const monthlyRows = allMonths.map((month: string) => ({
      month,
      lent: parseFloat(lentByMonth.find((r: any) => r.month === month)?.lent || 0),
      received: parseFloat(receivedByMonth.find((r: any) => r.month === month)?.received || 0),
    }));

    return {
      ...totals,
      totalExpected,
      totalReceived,
      valorEmAberto,
      totalOverdue,
      totalInterestReceived,
      profit: totalInterestReceived,
      totalExpectedProfit,
      capitalRecovered,
      rentabilidade,
      lucroAReceber,
      pendingApproval: parseInt(pendingRows[0]?.cnt || 0),
      pendingProof: parseInt(proofRows[0]?.cnt || 0),
      overdueClientsCount: parseInt(inadRows[0]?.cnt || 0),
      totalDueToday,
      totalReceivedToday,
      monthlyChart: monthlyRows,
    };
  }),

  getPendingCount: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const loanRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loans WHERE status='pendente'`);
    const proofRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE status='em_analise'`);
    return {
      pendingLoans: parseInt(loanRows[0]?.cnt || 0),
      pendingProofs: parseInt(proofRows[0]?.cnt || 0),
    };
  }),

  // ââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Â
  // LADO DO CLIENTE ââ‚¬â€ via token da planilha (publicProcedure)
  // ââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Âââ€¢Â

  getClientLoanInfo: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
    const db = await getDb() as any;
    await ensurePixDisbursementColumns(db);
    let session: any;
    try {
      session = await requireLoanRouteAccess(db, input.token);
    } catch (error: any) {
      if (error?.message?.includes('Atualize foto')) {
        return { enabled: false, profileIncomplete: true, message: error.message, client: null, loans: [], pixConfig: null };
      }
      throw error;
    }
    const token = input.token.trim();

    // Buscar ou criar loanClient automaticamente
    let clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);

    if (!clients.length) {
      // Verificar se já existe um loanClient com o mesmo CPF ou telefone, mesmo em outro formato.
      const allLoanClients = await qRows(db, drizzleSql`SELECT * FROM loanClients`);
      const existingByIdentity = allLoanClients.filter((row: any) => isSameLoanIdentity(row, session.cpf, session.phone));

      if (existingByIdentity.length) {
        // Vincular o token ao cliente existente em vez de criar duplicata
        await db.execute(drizzleSql`UPDATE loanClients SET spreadsheetToken=${token}, updatedAt=NOW() WHERE id=${existingByIdentity[0].id}`);
        clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE id=${existingByIdentity[0].id}`);
      } else {
        // Criar automaticamente com loanEnabled=1 (padrão liberado)
        const profiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE slug='bronze' AND isActive=1 LIMIT 1`);
        const profile = profiles[0];
        const creditLimit = profile?.creditLimit || 500;
        const interestRate = profile?.interestRate || 5;
        const maxDays = profile?.maxDays || 30;
        // Usar defaultPaymentTypes do perfil (não hardcoded) para respeitar a configuração do ADM
        const defaultPaymentTypes = profile?.defaultPaymentTypes || 'diario';
        await db.execute(drizzleSql`
          INSERT INTO loanClients (userId, name, cpf, phone, status, profileSlug, creditLimit, interestRate, maxDays, loanEnabled, allowedPaymentTypes, spreadsheetToken)
          VALUES (1, ${session.name}, ${session.cpf || null}, ${session.phone}, 'ativo', 'bronze', ${creditLimit}, ${interestRate}, ${maxDays}, 1, ${defaultPaymentTypes}, ${token})
        `);
        clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
      }
    }

    const storedClient = clients[0];
    // Mantém a compatibilidade dos clientes antigos que já possuíam chave PIX
    // antes dos campos específicos de recebimento. Não altera registros aqui.
    const client = {
      ...storedClient,
      client_pix_key: String(storedClient.client_pix_key || storedClient.pixKey || '').trim(),
      client_pix_name: String(storedClient.client_pix_name || storedClient.pixName || '').trim(),
      client_pix_bank: String(storedClient.client_pix_bank || '').trim(),
    };
    try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
      console.warn('[loans.getClientLoanInfo] sincronização unificada não aplicada:', error?.message);
    }

    // Um mesmo cliente pode ter sido vinculado por token, CPF ou telefone em momentos diferentes.
    // Reunimos esses vínculos para o empréstimo atual nunca ficar escondido por um cadastro antigo quitado.
    const identityRows = await qRows(db, drizzleSql`SELECT id, cpf, phone FROM loanClients`);
    const relatedClientIds = Array.from(new Set([
      Number(client.id),
      ...identityRows.filter((row: any) => isSameLoanIdentity(row, session.cpf, session.phone)).map((row: any) => Number(row.id)),
    ].filter(Boolean)));
    const relatedClientIdsSql = drizzleSql.raw(relatedClientIds.join(','));

    const loans = await qRows(db, drizzleSql`
      SELECT l.*,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pago') as paidInstallments,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id) as totalInstallments,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='em_analise') as pendingProofs
      FROM loans l
      WHERE l.clientId IN (${relatedClientIdsSql})
      ORDER BY CASE WHEN l.status IN ('pendente','aprovado','aguardando_pagamento','em_analise') THEN 0 ELSE 1 END, l.createdAt DESC
    `);
    const today = getBrazilToday();
    // Busca empréstimos com parcelas pendentes vencidas
    const overdueClientLoans = await qRows(db, drizzleSql`
      SELECT DISTINCT loanId FROM loanInstallments
      WHERE dueDate < ${today} AND status IN ('pendente','atrasado')
    `);
    const overdueClientLoanIds = new Set(overdueClientLoans.map((r: any) => r.loanId));
    const loansWithStatus = loans.map((l: any) => ({
      ...l,
      isOverdue: !["pago", "cancelado", "reprovado"].includes(l.status) && overdueClientLoanIds.has(l.id),
    }));

    const pixRows = await qRows(db, drizzleSql`SELECT * FROM loanPixConfig WHERE isActive=1 ORDER BY id DESC LIMIT 1`);
    const pixConfig = pixRows[0] || null;

    // ── Score A/B/C/D ────────────────────────────────────────────────────────
    // Buscar histórico de todos os empréstimos do cliente
    const allLoans = loans;
    const allLoanIds = allLoans.map((l: any) => l.id);
    let score: 'A' | 'B' | 'C' | 'D' = 'A';
    let scorePct = 100;
    let scoreLabel = 'Excelente';
    let scoreColor = '#10b981'; // verde

    if (client.status === 'bloqueado' || client.status === 'inativo') {
      score = 'D'; scorePct = 0; scoreLabel = 'Desativado'; scoreColor = '#6b7280';
    } else if (allLoanIds.length > 0) {
      // Contar parcelas atrasadas com regra de 18h:
      // - Pendentes com vencimento antes de hoje = atrasadas
      // - Pagas após 18h do dia de vencimento = pagas com atraso
      // Limite: dueDate + 18h = UNIX_TIMESTAMP(dueDate) * 1000 + 64800000 ms
      const overdueInstalls = await qRows(db, drizzleSql`
        SELECT COUNT(*) as cnt FROM loanInstallments
        WHERE loanId IN (${drizzleSql.raw(allLoanIds.join(','))})
        AND status IN ('pendente','atrasado') AND dueDate < ${today}
      `);
      const overdueCount = parseInt(overdueInstalls[0]?.cnt || '0');
      // Score baseado APENAS em parcelas pendentes vencidas atualmente
      // Histórico de pagas com atraso não contamina o score atual
      if (overdueCount === 0) { score = 'A'; scorePct = 100; scoreLabel = 'Excelente'; scoreColor = '#10b981'; }
      else if (overdueCount <= 2) { score = 'B'; scorePct = 75; scoreLabel = 'Bom'; scoreColor = '#f59e0b'; }
      else if (overdueCount <= 5) { score = 'C'; scorePct = 50; scoreLabel = 'Regular'; scoreColor = '#f97316'; }
      else { score = 'D'; scorePct = 0; scoreLabel = 'Inadimplente'; scoreColor = '#ef4444'; }
    }

    // ── Próxima parcela (de todos os empréstimos ativos) ─────────────────────
    let nextInstallment: any = null;
    if (allLoanIds.length > 0) {
      const nextInsts = await qRows(db, drizzleSql`
        SELECT li.*, l.id as loanId FROM loanInstallments li
        JOIN loans l ON l.id = li.loanId
        WHERE li.loanId IN (${drizzleSql.raw(allLoanIds.join(','))})
        AND li.status IN ('pendente', 'atrasado')
        AND l.status NOT IN ('pago','cancelado','reprovado')
        ORDER BY li.dueDate ASC LIMIT 1
      `);
      nextInstallment = nextInsts[0] || null;
    }

    // ── Limite futuro (ao quitar tudo) ───────────────────────────────────────
    const profiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE isActive=1 ORDER BY sortOrder ASC`);
    const currentProfile = profiles.find((p: any) => p.slug === client.profileSlug) || profiles[0];
    const nextProfile = profiles.find((p: any) => p.sortOrder > (currentProfile?.sortOrder || 0)) || null;
    const futureLimit = nextProfile ? nextProfile.creditLimit : (currentProfile?.creditLimit || client.creditLimit);
    const futureProfileName = nextProfile ? nextProfile.name : null;
    // Dados exclusivamente de leitura para explicar ao cliente as condições dos níveis H2 Score.
    // A tabela loanProfiles permanece como fonte única de taxa, limite e prazo.
    const h2ScoreProfiles = profiles
      .filter((profile: any) => ['bronze', 'prata', 'ouro', 'diamante'].includes(String(profile.slug || '').toLowerCase()))
      .map((profile: any) => ({
        slug: String(profile.slug).toLowerCase(),
        name: profile.name,
        interestRate: Number(profile.interestRate || 0),
        creditLimit: Number(profile.creditLimit || 0),
      }));

    const mainCustomer = await findMainCustomerByIdentity({ phone: session.phone, cpf: session.cpf }, db);
    // O saldo é do cadastro principal do cliente; os IDs técnicos de empréstimo não criam outra conta de Score.
    const h2Score = mainCustomer
      ? await getCustomerH2ScoreSummary(db, Number(mainCustomer.id), Number(client.id))
      : await getClientH2ScoreSummary(db, relatedClientIds);

    return {
      enabled: true, client, loans: loansWithStatus, pixConfig,
      clientScore: { score, scorePct, scoreLabel, scoreColor },
      h2Score,
      nextInstallment,
      futureLimit,
      futureProfileName,
      h2ScoreProfiles,
    };
  }),

  getClientInstallments: publicProcedure.input(z.object({
    token: z.string(),
    loanId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];
    const identities = await qRows(db, drizzleSql`SELECT id, cpf, phone FROM loanClients`);
    const clientIds = Array.from(new Set([
      Number(client.id),
      ...identities.filter((row: any) => isSameLoanIdentity(row, client.cpf, client.phone)).map((row: any) => Number(row.id)),
    ].filter(Boolean)));
    const loans = await qRows(db, drizzleSql`SELECT * FROM loans WHERE id=${input.loanId} AND clientId IN (${drizzleSql.raw(clientIds.join(','))})`);
    if (!loans.length) throw new TRPCError({ code: "NOT_FOUND" });

    const clock = getBrazilClock();
    const rawInstallments = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE loanId=${input.loanId} ORDER BY installmentNumber ASC`);
    const scoreByInstallment = await getH2ScoreSubmissionMap(db, rawInstallments.map((i: any) => Number(i.id)));
    const configRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const lateFeeConfig = configRows[0];
    const installments = rawInstallments.map((i: any) => {
      const canPreviewLateFee = !client.late_fee_disabled
        && i.originalAmount == null
        && ["pendente", "atrasado"].includes(i.status);
      const originalAmount = Number(i.amount || 0);
      const feeApplied = canPreviewLateFee
        ? calculateLateFeeForInstallment({ dueDate: i.dueDate, amount: originalAmount, config: lateFeeConfig, clock })
        : 0;
      const hasPreviewLateFee = feeApplied > 0;
      const amountWithPreview = hasPreviewLateFee
        ? Math.round((originalAmount + feeApplied) * 100) / 100
        : i.amount;

      return {
        ...i,
        amount: amountWithPreview,
        ...(hasPreviewLateFee ? {
          originalAmount: originalAmount.toFixed(2),
          feeApplied: feeApplied.toFixed(2),
          lateFeePreview: true,
        } : {}),
        h2ScoreSubmission: scoreByInstallment.get(Number(i.id)) || null,
        isOverdue: !["pago"].includes(i.status) && i.dueDate < clock.today,
      };
    });
    return { loan: loans[0], installments };
  }),

  submitInstallmentProof: publicProcedure.input(z.object({
    token: z.string(),
    installmentId: z.number(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];
    const identities = await qRows(db, drizzleSql`SELECT id, cpf, phone FROM loanClients`);
    const clientIds = Array.from(new Set([
      Number(client.id),
      ...identities.filter((row: any) => isSameLoanIdentity(row, client.cpf, client.phone)).map((row: any) => Number(row.id)),
    ].filter(Boolean)));

    const inst = await qRows(db, drizzleSql`
      SELECT li.* FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=${input.installmentId} AND l.clientId IN (${drizzleSql.raw(clientIds.join(','))})
    `);
    if (!inst.length) throw new TRPCError({ code: "NOT_FOUND" });
    if (inst[0].status === 'em_analise' || inst[0].proofSentAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe um comprovante em análise para esta parcela." });
    }

    const receivedAt = new Date();
    const buffer = Buffer.from(input.fileBase64, "base64");
    const key = `loan-proofs/${client.id}/${input.installmentId}-${Date.now()}-${input.fileName}`;
    const { url } = await storagePut(key, buffer, input.mimeType);

    // O comprovante apenas entra em análise: ele não confirma o pagamento nem elimina a taxa.
    // Se a parcela já venceu, aplica a regra global vigente uma única vez antes de mudar o status.
    const today = getBrazilToday();
    const dueDateValue = inst[0].dueDate;
    const dueDate = typeof dueDateValue === 'string'
      ? dueDateValue.slice(0, 10)
      : new Date(dueDateValue).toISOString().slice(0, 10);
    const hasExistingFee = inst[0].originalAmount != null;
    let appliedFee = 0;
    if (!hasExistingFee && !client.late_fee_disabled && dueDate <= today) {
      const configRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
      const config = configRows[0];
      if (config?.enabled) {
        const originalAmount = parseFloat(inst[0].amount || 0);
        appliedFee = calculateLateFeeForInstallment({
          dueDate,
          amount: originalAmount,
          config,
          clock: getBrazilClock(),
        });
        if (appliedFee > 0) {
          const updatedAmount = Math.round((originalAmount + appliedFee) * 100) / 100;
          const note = `Taxa de atraso automática: +R$ ${appliedFee.toFixed(2).replace('.', ',')} aplicada no envio do comprovante em ${new Date().toLocaleDateString('pt-BR')}`;
          await db.execute(drizzleSql`
            UPDATE loanInstallments
            SET amount=${updatedAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)},
                feeApplied=${appliedFee.toFixed(2)}, notes=${note}, proofUrl=${url}, proofSentAt=${receivedAt}, status='em_analise'
            WHERE id=${input.installmentId}
          `);
        }
      }
    }

    if (appliedFee <= 0) {
      await db.execute(drizzleSql`UPDATE loanInstallments SET proofUrl=${url}, proofSentAt=${receivedAt}, status='em_analise' WHERE id=${input.installmentId}`);
    }
    const h2ScoreSubmission = await registerH2ScoreSubmission(db, {
      installmentId: input.installmentId,
      loanId: Number(inst[0].loanId),
      clientId: Number(client.id),
      dueDate,
      proofUrl: url,
      submittedAt: receivedAt,
    });
    return { ok: true, url, appliedFee, h2ScoreSubmission };
  }),

  // Simulação de parcelas (preview antes de confirmar) ââ‚¬â€ não cria no banco
  simulateLoan: publicProcedure.input(z.object({
    token: z.string(),
    amount: z.number().positive(),
    paymentType: z.enum(["diario", "semanal", "mensal", "quinzenal"]),
    workDays: z.enum(["seg_sab", "seg_dom"]).default("seg_sab"),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "Empréstimos não habilitados para este cliente" });
    const client = clients[0];
    if (parseFloat(client.creditLimit) < input.amount) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Valor solicitado excede seu limite de R$ ${parseFloat(client.creditLimit).toFixed(2)}` });
    }
    const today = getBrazilToday();
    const sim = simulateLoan(
      input.amount,
      parseFloat(client.interestRate),
      input.paymentType,
      parseInt(client.maxDays),
      input.workDays,
      today
    );
    // Não expor taxa ao cliente ââ‚¬â€ retorna apenas o resultado do cálculo
    return {
      installments: sim.installments,
      perInstallment: sim.perInstallment,
      totalAmount: sim.totalAmount,
      dueDate: sim.dueDate,
      schedule: sim.schedule,
    };
  }),

  requestLoan: publicProcedure.input(z.object({
    token: z.string(),
    amount: z.number().positive(),
    paymentType: z.enum(["diario", "semanal", "mensal", "quinzenal"]),
    workDays: z.enum(["seg_sab", "seg_dom"]).default("seg_sab"),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "Empréstimos não habilitados para este cliente" });
    const client = clients[0];

    if (parseFloat(client.creditLimit) < input.amount) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Valor solicitado excede seu limite de R$ ${parseFloat(client.creditLimit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` });
    }

    // Aceita os dados PIX já cadastrados nos campos antigos ou atuais, mas mantém
    // a exigência de chave, titular e banco para que a liberação seja segura.
    const pixKey = String(client.client_pix_key || client.pixKey || '').trim();
    const pixName = String(client.client_pix_name || client.pixName || '').trim();
    const pixBank = String(client.client_pix_bank || '').trim();
    if (!pixKey || !pixName || !pixBank) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Complete sua chave PIX para recebimento (chave, nome do titular e banco) antes de solicitar o empréstimo." });
    }

    // A configuração individual gravada pelo ADM no cliente tem prioridade.
    // O perfil serve apenas para definir o valor inicial quando o cliente é criado.
    const effectiveAllowed = String(client.allowedPaymentTypes || "diario")
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);
    if (!effectiveAllowed.includes(input.paymentType)) {
      const modeLabel: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', quinzenal: 'Quinzenal', parcelado: 'Parcelado' };
      const allowedLabels = effectiveAllowed.map((t: string) => modeLabel[t] || t).join(', ');
      throw new TRPCError({ code: "BAD_REQUEST", message: `Modo de pagamento não liberado para este cliente. Modos disponíveis: ${allowedLabels}` });
    }

    const today = getBrazilToday();
    const sim = simulateLoan(
      input.amount,
      parseFloat(client.interestRate),
      input.paymentType,
      parseInt(client.maxDays),
      input.workDays,
      today
    );

    const result = await db.execute(drizzleSql`
      INSERT INTO loans (userId, clientId, amount, interestRate, days, paymentType, installments,
        interestAmount, totalAmount, releaseDate, dueDate, status, notes, workDays)
      VALUES (1, ${client.id}, ${input.amount}, ${parseFloat(client.interestRate)}, ${parseInt(client.maxDays)},
        ${input.paymentType}, ${sim.installments}, ${sim.interestAmount}, ${sim.totalAmount},
        ${today}, ${sim.dueDate}, 'pendente', ${input.notes || null}, ${input.workDays})
    `);
    const loanId = (result[0] as any).insertId;

    for (const inst of sim.schedule) {
      await db.execute(drizzleSql`INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount) VALUES (${loanId}, ${inst.installmentNumber}, ${inst.dueDate}, ${inst.amount})`);
    }

    return { id: loanId, totalAmount: sim.totalAmount, installments: sim.installments, perInstallment: sim.perInstallment };
  }),

  // Salva a chave PIX do cliente
  saveClientPixKey: publicProcedure.input(z.object({
    token: z.string(),
    pixKey: z.string().min(5, "Chave PIX inválida").max(200),
    pixName: z.string().min(2, "Nome do titular obrigatório").max(200),
    pixBank: z.string().min(2, "Nome do banco obrigatório").max(100),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
    await db.execute(drizzleSql`UPDATE loanClients SET client_pix_key=${input.pixKey.trim()}, client_pix_name=${input.pixName.trim()}, client_pix_bank=${input.pixBank.trim()} WHERE spreadsheetToken=${token}`);
    return { ok: true };
  }),

  // Lista todos os clientes com senha no /gastos com status de empréstimo habilitado
  listSpreadsheetClients: adminProcedure.query(async () => {
    const db = await getDb() as any;
    return await qRows(db, drizzleSql`
      SELECT sc.id, sc.name, sc.phone, sc.cpf, sc.status as clientStatus,
        lc.id as loanClientId, lc.loanEnabled, lc.creditLimit, lc.interestRate,
        lc.profileSlug, lc.status as loanStatus, lc.allowedPaymentTypes,
        (SELECT COUNT(*) FROM loans l WHERE l.clientId = lc.id AND l.status NOT IN ('cancelado','reprovado')) as activeLoans
      FROM spreadsheetClients sc
      LEFT JOIN loanClients lc ON lc.phone = sc.phone
      WHERE EXISTS (SELECT 1 FROM spreadsheetPasswords sp WHERE sp.phone = sc.phone)
      ORDER BY sc.name ASC
    `);
  }),

  // ââ€â‚¬ââ€â‚¬ TAXA DE ATRASO E REGRAS ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

  // Busca configuração de taxa de atraso (pública ââ‚¬â€ usada pelo cliente para exibir regras)
  getLateFeeConfig: publicProcedure.query(async () => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    if (!rows.length) return { enabled: true, fee_after_18h: 10, fee_after_20h: 10, fee_after_midnight_pct: 100, rules_text: null };
    return rows[0];
  }),

  // Salva configuração de taxa de atraso (admin)
  saveLateFeeConfig: adminProcedure.input(z.object({
    enabled: z.boolean(),
    fee_after_18h: z.number().min(0),
    fee_after_20h: z.number().min(0),
    fee_after_midnight_pct: z.number().min(0).max(1000),
    rules_text: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const now = Date.now();
    await db.execute(drizzleSql`
      INSERT INTO loan_late_fee_config (id, enabled, fee_after_18h, fee_after_20h, fee_after_midnight_pct, rules_text, updated_at)
      VALUES (1, ${input.enabled}, ${input.fee_after_18h}, ${input.fee_after_20h}, ${input.fee_after_midnight_pct}, ${input.rules_text || null}, ${now})
      ON DUPLICATE KEY UPDATE
        enabled=${input.enabled}, fee_after_18h=${input.fee_after_18h},
        fee_after_20h=${input.fee_after_20h}, fee_after_midnight_pct=${input.fee_after_midnight_pct},
        rules_text=${input.rules_text || null}, updated_at=${now}
    `);
    return { ok: true };
  }),

  // Toggle taxa de atraso por cliente específico (admin)
  toggleClientLateFee: adminProcedure.input(z.object({
    clientId: z.number(),
    disabled: z.boolean(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`UPDATE loanClients SET late_fee_disabled=${input.disabled}, updatedAt=NOW() WHERE id=${input.clientId}`);
    return { ok: true };
  }),

  // Calcula taxa de atraso para uma parcela específica (chamado pelo cliente ao ver parcelas)
  calcLateFee: publicProcedure.input(z.object({
    token: z.string(),
    installmentId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    await requireLoanRouteAccess(db, input.token);
    const token = input.token.trim();
    const clients = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE spreadsheetToken=${token}`);
    if (!clients.length) throw new TRPCError({ code: "UNAUTHORIZED" });
    const client = clients[0];

    // Se taxa desativada para este cliente, retorna zero
    if (client.late_fee_disabled) return { lateFee: 0, breakdown: null };

    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const cfg = cfgRows[0];
    if (!cfg || !cfg.enabled) return { lateFee: 0, breakdown: null };

    const inst = await qRows(db, drizzleSql`
      SELECT li.*, l.clientId FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=${input.installmentId} AND l.clientId=${client.id}
    `);
    if (!inst.length) throw new TRPCError({ code: "NOT_FOUND" });
    const installment = inst[0];

    // Só apresenta taxa para uma parcela pendente/atrasada. O cálculo é o mesmo da tela e do envio.
    const clock = getBrazilClock();
    if (!["pendente", "atrasado"].includes(installment.status) || installment.dueDate > clock.date) {
      return { lateFee: 0, breakdown: null };
    }

    const amount = parseFloat(installment.amount);
    const lateFee = calculateLateFeeForInstallment({ dueDate: installment.dueDate, amount, config: cfg, clock });
    const fixedFeeAfter20 = parseFloat(cfg.fee_after_18h || '0') + parseFloat(cfg.fee_after_20h || '0');
    let breakdown: string[] = [];

    if (installment.dueDate < clock.date) {
      breakdown = [`Após 23:59: será cobrado o maior valor entre a taxa fixa de R$ ${fixedFeeAfter20.toFixed(2)} e o valor da parcela (taxa aplicada: R$ ${lateFee.toFixed(2)})`];
    } else if (clock.hour >= 20) {
      breakdown = [`Após 20h: taxa fixa acumulada de R$ ${lateFee.toFixed(2)}`];
    } else if (clock.hour >= 18) {
      breakdown = [`Após 18h: +R$ ${lateFee.toFixed(2)}`];
    }

    return { lateFee, totalWithFee: amount + lateFee, breakdown };
  }),

  // Ativar/desativar empréstimo por telefone (cria loanClient se não existir)
  toggleLoanByPhone: adminProcedure.input(z.object({
    phone: z.string(),
    enabled: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const existing = await qRows(db, drizzleSql`SELECT id FROM loanClients WHERE phone=${input.phone}`);
    if (existing.length) {
      // Atualiza todos os registros com esse telefone (evita inconsistência em duplicatas)
      await db.execute(drizzleSql`UPDATE loanClients SET loanEnabled=${input.enabled}, updatedAt=NOW() WHERE phone=${input.phone}`);
    } else {
      const clients = await qRows(db, drizzleSql`SELECT * FROM spreadsheetClients WHERE phone=${input.phone} LIMIT 1`);
      if (!clients.length) throw new TRPCError({ code: "NOT_FOUND" });
      const sc = clients[0];
      let mainCustomer: any;
      try {
        mainCustomer = await requireCompleteMainCustomerProfile(db, { phone: sc.phone, cpf: sc.cpf });
      } catch (profileError: any) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: profileError?.message || 'Conclua o cadastro principal antes de habilitar empréstimos.' });
      }
      const profiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE slug='bronze' AND isActive=1 LIMIT 1`);
      const profile = profiles[0];
      const paymentTypes = profile?.defaultPaymentTypes || 'diario';
      await db.execute(drizzleSql`
        INSERT INTO loanClients (userId, name, cpf, phone, status, profileSlug, creditLimit, interestRate, maxDays, loanEnabled, allowedPaymentTypes)
        VALUES (1, ${mainCustomer.name}, ${mainCustomer.cpf || null}, ${mainCustomer.phone}, 'ativo', 'bronze', ${profile?.creditLimit || 500}, ${profile?.interestRate || 5}, ${profile?.maxDays || 30}, ${input.enabled}, ${paymentTypes})
      `);
    }
    try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
      console.warn('[loans.toggleLoanByPhone] sincronização unificada não aplicada:', error?.message);
    }
    return { ok: true };
  }),

  // ââ€â‚¬ââ€â‚¬ ANÍƒÂLISE FINANCEIRA (admin) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  getFinancialAnalysis: adminProcedure.input(z.object({
    period: z.enum(['day', 'month', 'year']),
    date: z.string(), // YYYY-MM-DD para day, YYYY-MM para month, YYYY para year
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    const { period, date } = input;

    // Montar condição de data para parcelas
    let dateCondition: string;
    if (period === 'day') dateCondition = `DATE(li.dueDate) = '${date}'`;
    else if (period === 'month') dateCondition = `DATE_FORMAT(li.dueDate, '%Y-%m') = '${date}'`;
    else dateCondition = `YEAR(li.dueDate) = ${date}`;

    let loanDateCondition: string;
    if (period === 'day') loanDateCondition = `DATE(l.createdAt) = '${date}'`;
    else if (period === 'month') loanDateCondition = `DATE_FORMAT(l.createdAt, '%Y-%m') = '${date}'`;
    else loanDateCondition = `YEAR(l.createdAt) = ${date}`;

    let paidDateCondition: string;
    if (period === 'day') paidDateCondition = `DATE(CONVERT_TZ(li.paidAt, '+00:00', '-03:00')) = '${date}'`;
    else if (period === 'month') paidDateCondition = `DATE_FORMAT(CONVERT_TZ(li.paidAt, '+00:00', '-03:00'), '%Y-%m') = '${date}'`;
    else paidDateCondition = `YEAR(CONVERT_TZ(li.paidAt, '+00:00', '-03:00')) = ${date}`;

    // 1. Já recebi (parcelas pagas no período)
    const alreadyReceivedRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as total, COUNT(*) as count
      FROM loanInstallments li
      WHERE li.status = 'pago' AND ${drizzleSql.raw(paidDateCondition)}
    `);

    // 2. Vou receber (parcelas pendentes com vencimento no período)
    const willReceiveRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as total, COUNT(*) as count
      FROM loanInstallments li
      WHERE li.status IN ('pendente', 'atrasado', 'em_analise') AND ${drizzleSql.raw(dateCondition)}
    `);

    // 3. Quanto vou ganhar de juros (proporcional ao período)
    const interestProjectionRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(
        l.interestAmount * (1.0 / GREATEST(l.installments, 1))
      ), 0) as totalInterest
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.status IN ('pendente', 'atrasado', 'em_analise') AND ${drizzleSql.raw(dateCondition)}
    `);

    // 4. Juros já recebidos no período
    const interestReceivedRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(
        l.interestAmount * (1.0 / GREATEST(l.installments, 1))
      ), 0) as totalInterest
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.status = 'pago' AND ${drizzleSql.raw(paidDateCondition)}
    `);

    // 5. Perdas: emprestado em empréstimos cancelados/reprovados no período
    const lossRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(l.amount), 0) as lostPrincipal,
             COALESCE(SUM(l.interestAmount), 0) as lostInterest,
             COUNT(*) as count
      FROM loans l
      WHERE l.status IN ('cancelado', 'reprovado') AND ${drizzleSql.raw(loanDateCondition)}
    `);

    // 6. Inadimplência: parcelas atrasadas (vencidas e não pagas) no período
    const today = getBrazilToday();
    const overdueRows = await qRows(db, drizzleSql`
      SELECT COALESCE(SUM(li.amount), 0) as total, COUNT(*) as count
      FROM loanInstallments li
      WHERE li.status IN ('pendente','atrasado') AND li.dueDate < ${today} AND ${drizzleSql.raw(dateCondition)}
    `);

    // 7. Timeline: parcelas a receber por dia (para gráfico)
    let timelineRows: any[] = [];
    if (period === 'month') {
      timelineRows = await qRows(db, drizzleSql`
        SELECT DATE(li.dueDate) as day,
          SUM(CASE WHEN li.status='pago' THEN li.amount ELSE 0 END) as received,
          SUM(CASE WHEN li.status IN ('pendente','atrasado','em_analise') THEN li.amount ELSE 0 END) as pending
        FROM loanInstallments li
        WHERE DATE_FORMAT(li.dueDate, '%Y-%m') = ${date}
        GROUP BY day ORDER BY day ASC
      `);
    } else if (period === 'year') {
      timelineRows = await qRows(db, drizzleSql`
        SELECT DATE_FORMAT(li.dueDate, '%Y-%m') as month,
          SUM(CASE WHEN li.status='pago' THEN li.amount ELSE 0 END) as received,
          SUM(CASE WHEN li.status IN ('pendente','atrasado','em_analise') THEN li.amount ELSE 0 END) as pending
        FROM loanInstallments li
        WHERE YEAR(li.dueDate) = ${date}
        GROUP BY month ORDER BY month ASC
      `);
    }

    // 8. Próximas parcelas a vencer (para tabela "quando vou receber")
    const upcomingRows = await qRows(db, drizzleSql`
      SELECT li.id, li.dueDate, li.amount, li.installmentNumber,
             lc.name as clientName, l.id as loanId
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      JOIN loanClients lc ON lc.id = l.clientId
      WHERE li.status IN ('pendente','atrasado','em_analise') AND ${drizzleSql.raw(dateCondition)}
      ORDER BY li.dueDate ASC
      LIMIT 100
    `);

    // 9. Rentabilidade global (Lucro Total Previsto / Capital Emprestado)
    const rentRows = await qRows(db, drizzleSql`
      SELECT
        COALESCE(SUM(interestAmount), 0) as totalExpectedProfit,
        COALESCE(SUM(amount), 0) as totalLent
      FROM loans
      WHERE status NOT IN ('cancelado','reprovado')
    `);
    const rentTotalProfit = parseFloat(rentRows[0]?.totalExpectedProfit || 0);
    const rentTotalLent = parseFloat(rentRows[0]?.totalLent || 0);
    const rentabilidade = rentTotalLent > 0 ? (rentTotalProfit / rentTotalLent) * 100 : 0;

    return {
      alreadyReceived: parseFloat(alreadyReceivedRows[0]?.total || 0),
      alreadyReceivedCount: parseInt(alreadyReceivedRows[0]?.count || 0),
      willReceive: parseFloat(willReceiveRows[0]?.total || 0),
      willReceiveCount: parseInt(willReceiveRows[0]?.count || 0),
      projectedInterest: parseFloat(interestProjectionRows[0]?.totalInterest || 0),
      receivedInterest: parseFloat(interestReceivedRows[0]?.totalInterest || 0),
      lostPrincipal: parseFloat(lossRows[0]?.lostPrincipal || 0),
      lostInterest: parseFloat(lossRows[0]?.lostInterest || 0),
      lostCount: parseInt(lossRows[0]?.count || 0),
      overdueAmount: parseFloat(overdueRows[0]?.total || 0),
      overdueCount: parseInt(overdueRows[0]?.count || 0),
      timeline: timelineRows,
      upcoming: upcomingRows,
      rentabilidade,
    };
  }),

  // Corrige parcelas pendentes que caem no domingo para empréstimos com workDays=seg_sab
  fixSundayInstallments: adminProcedure.mutation(async () => {
    const db = await getDb() as any;
    // Busca parcelas pendentes em domingo de empréstimos seg_sab
    const sundayRows = await qRows(db, drizzleSql`
      SELECT li.id, li.dueDate
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.status = 'pendente'
        AND l.workDays = 'seg_sab'
        AND DAYOFWEEK(li.dueDate) = 1
    `);
    let fixed = 0;
    for (const row of sundayRows) {
      // Move para segunda-feira (adiciona 1 dia)
      const sunday = new Date(row.dueDate + 'T12:00:00Z');
      sunday.setUTCDate(sunday.getUTCDate() + 1);
      const monday = sunday.toISOString().slice(0, 10);
      await db.execute(drizzleSql`UPDATE loanInstallments SET dueDate=${monday} WHERE id=${row.id}`);
      fixed++;
    }
    // Atualiza o dueDate do empréstimo (data da última parcela)
    const loansToFix = await qRows(db, drizzleSql`
      SELECT DISTINCT l.id
      FROM loans l
      JOIN loanInstallments li ON li.loanId = l.id
      WHERE l.workDays = 'seg_sab' AND l.status NOT IN ('pago','cancelado','reprovado')
    `);
    for (const loan of loansToFix) {
      const lastInst = await qRows(db, drizzleSql`
        SELECT dueDate FROM loanInstallments WHERE loanId=${loan.id} ORDER BY installmentNumber DESC LIMIT 1
      `);
      if (lastInst[0]) {
        await db.execute(drizzleSql`UPDATE loans SET dueDate=${lastInst[0].dueDate} WHERE id=${loan.id}`);
      }
    }
    return { fixed, message: `${fixed} parcela(s) corrigida(s) de domingo para segunda-feira` };
  }),

  // Edita um empréstimo ativo: recalcula juros, total e parcelas pendentes
  editLoan: adminProcedure.input(z.object({
    id: z.number(),
    amount: z.number().positive(),
    interestRate: z.number().min(0),
    days: z.number().positive(),
    paymentType: z.enum(["diario", "semanal", "mensal", "quinzenal", "parcelado"]),
    workDays: z.enum(["seg_sab", "seg_dom", "custom"]).default("seg_sab"),
    customInstallments: z.number().min(1).max(365).optional(),
    releaseDate: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["pendente", "aprovado", "reprovado", "cancelado", "pago"]).optional(),
    rejectedReason: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const loans = await qRows(db, drizzleSql`SELECT * FROM loans WHERE id=${input.id}`);
    if (!loans.length) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado" });
    const loan = loans[0];

    // Recalcula com os novos valores (parcelado usa releaseDate do banco se não fornecido)
    const effectiveReleaseDate = input.releaseDate || loan.releaseDate || getBrazilToday();
    // Para parcelado, simulateLoan usa mensal internamente
    const simPaymentType = (input.paymentType === 'parcelado' ? 'mensal' : input.paymentType) as 'diario' | 'semanal' | 'mensal' | 'quinzenal';
    const sim = simulateLoan(input.amount, input.interestRate, simPaymentType, input.days, input.workDays, effectiveReleaseDate, input.customInstallments);

    // Reserva parcelas já pagas ou com comprovante em análise. Elas não podem ser
    // recriadas durante uma edição, pois isso duplicaria o mesmo número de parcela.
    const reservedRows = await qRows(db, drizzleSql`
      SELECT installmentNumber FROM loanInstallments
      WHERE loanId=${input.id} AND status IN ('pago', 'pago_juros', 'em_analise', 'aguardando_confirmacao', 'atrasado')
    `);
    const reservedInstallmentNumbers = new Set(reservedRows.map((row: any) => Number(row.installmentNumber)));

    // Status a aplicar (usa o atual se não fornecido)
    const newStatus = input.status || loan.status;

    // Atualiza o empréstimo (inclui status e motivo de reprovação se fornecidos)
    await db.execute(drizzleSql`
      UPDATE loans SET
        amount=${input.amount},
        interestRate=${input.interestRate},
        days=${input.days},
        paymentType=${input.paymentType},
        workDays=${input.workDays},
        installments=${sim.installments},
        interestAmount=${sim.interestAmount},
        totalAmount=${sim.totalAmount},
        releaseDate=${effectiveReleaseDate},
        dueDate=${sim.dueDate},
        notes=${input.notes || loan.notes || null},
        status=${newStatus},
        rejectedReason=${newStatus === 'reprovado' ? (input.rejectedReason || loan.rejectedReason || null) : loan.rejectedReason || null},
        rejectedAt=${newStatus === 'reprovado' && loan.status !== 'reprovado' ? new Date().toISOString().slice(0,19).replace('T',' ') : loan.rejectedAt || null}
      WHERE id=${input.id}
    `);

    // Remove apenas as parcelas pendentes (preserva as pagas)
    await db.execute(drizzleSql`DELETE FROM loanInstallments WHERE loanId=${input.id} AND status='pendente'`);

    // Recria as parcelas pendentes a partir da (paidCount+1)
    // (apenas se o status for ativo/aprovado — reprovado/cancelado não precisa de parcelas)
    let pendingNum = 0;
    if (!['reprovado', 'cancelado'].includes(newStatus)) {
      for (const inst of sim.schedule) {
        if (!reservedInstallmentNumbers.has(inst.installmentNumber)) {
          await db.execute(drizzleSql`
            INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount)
            VALUES (${input.id}, ${inst.installmentNumber}, ${inst.dueDate}, ${inst.amount})
          `);
          pendingNum++;
        }
      }
    }

    return { ok: true, totalAmount: sim.totalAmount, installments: sim.installments, pendingRecreated: pendingNum, newStatus };
  }),

  // ââ€â‚¬ââ€â‚¬ Pagamento Só de Juros ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

  toggleInterestOnly: adminProcedure.input(z.object({
    loanId: z.number(),
    enabled: z.boolean(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    await db.execute(drizzleSql`UPDATE loans SET interestOnlyEnabled=${input.enabled ? 1 : 0} WHERE id=${input.loanId}`);
    return { ok: true };
  }),

  payInterestOnly: adminProcedure.input(z.object({
    loanId: z.number(),
    installmentId: z.number(), // ID da parcela pendente escolhida para pagar somente os juros
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const loans = await qRows(db, drizzleSql`SELECT * FROM loans WHERE id=${input.loanId}`);
    if (!loans.length) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado" });
    const loan = loans[0];
    if (!loan.interestOnlyEnabled) throw new TRPCError({ code: "BAD_REQUEST", message: "Função de pagamento só de juros não está ativada neste empréstimo" });
    if (["pago", "cancelado", "reprovado"].includes(loan.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Empréstimo já encerrado" });

    // Busca a parcela específica
    const today = getBrazilToday();
    const instRows = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE id=${input.installmentId} AND loanId=${input.loanId}`);
    if (!instRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada" });
    const inst = instRows[0];
    if (inst.status !== 'pendente') throw new TRPCError({ code: "BAD_REQUEST", message: "Parcela não está pendente" });
    const dueDateValue = inst.dueDate;
    const dueDate = typeof dueDateValue === 'string'
      ? dueDateValue.slice(0, 10)
      : new Date(dueDateValue).toISOString().slice(0, 10);
    // O cliente pode antecipar somente os juros; multa continua aplicável apenas após vencer.
    const isOverdue = dueDate < today;

    const loanPrincipal = parseFloat(loan.amount);
    const totalInstallments = parseInt(loan.installments);
    const interestRate = parseFloat(loan.interestRate);
    // Principal desta parcela = valor total do empréstimo / número de parcelas
    const principalPerInstallment = Math.round((loanPrincipal / totalInstallments) * 100) / 100;
    // Mesmo que uma taxa antiga exista no registro, ela nunca compõe o pagamento antecipado de juros.
    const feeApplied = isOverdue ? parseFloat(inst.feeApplied || 0) : 0;
    const interestOnPrincipal = Math.round(principalPerInstallment * (interestRate / 100) * 100) / 100;
    const totalJuros = Math.round((interestOnPrincipal + feeApplied) * 100) / 100;
    const paidBy = ctx.user?.name || "admin";

    // Determina intervalo conforme periodicidade
    const renewDays = loan.paymentType === "quinzenal" ? 15 : loan.paymentType === "semanal" ? 7 : 30;

    // Busca a última data de vencimento existente entre as parcelas pendentes (excluindo a atual)
    // para criar a nova parcela DEPOIS da última
    const lastInstRow = await qRows(db, drizzleSql`
      SELECT MAX(dueDate) as lastDue FROM loanInstallments
      WHERE loanId=${input.loanId} AND status='pendente' AND id != ${input.installmentId}
    `);
    const lastDueDate = lastInstRow[0]?.lastDue || inst.dueDate;
    const newDueDate = addDays(lastDueDate, renewDays);

    // Novo amount da parcela rolada = principal + juros novos (sem a taxa, que já foi cobrada)
    const newInstAmount = Math.round((principalPerInstallment + interestOnPrincipal) * 100) / 100;

    // Próximo número de parcela (após o maior existente)
    const maxInstRow = await qRows(db, drizzleSql`SELECT MAX(installmentNumber) as maxNum FROM loanInstallments WHERE loanId=${input.loanId}`);
    const nextInstNum = (parseInt(maxInstRow[0]?.maxNum || 0) + 1);

    // 1. Marca a parcela original como pago_juros
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET status='pago_juros', paidAt=NOW(), paidBy=${paidBy},
          paidAmount=${totalJuros},
          notes=CONCAT(COALESCE(notes,''), ' | juros_cobrados:', ${totalJuros.toFixed(2)}, ' em ', ${today})
      WHERE id=${inst.id}
    `);

    // 2. Cria nova parcela com principal + juros novos (dívida rolada), vencendo após a última
    await db.execute(drizzleSql`
      INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount, status, notes)
      VALUES (${input.loanId}, ${nextInstNum}, ${newDueDate}, ${newInstAmount}, 'pendente',
        ${'rolled_from_interest_only | Principal: R$ ' + principalPerInstallment.toFixed(2) + ' + Juros: R$ ' + interestOnPrincipal.toFixed(2)})
    `);

    // 3. Atualiza vencimento do empréstimo para a nova data e incrementa contador
    await db.execute(drizzleSql`
      UPDATE loans SET dueDate=${newDueDate}, interestOnlyCount=interestOnlyCount+1,
        status='aguardando_pagamento'
      WHERE id=${input.loanId}
    `);

    // 4. Registra entrada no financeiro (receita de juros cobrados)
    try {
      const clientRows = await qRows(db, drizzleSql`SELECT lc.name, lc.phone, COALESCE(lc.cpf, c.cpf) as cpf, c.email
        FROM loanClients lc
        LEFT JOIN customers c ON c.deletedAt IS NULL AND (
          RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE(lc.phone, '[^0-9]', ''), 9)
          OR (REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') <> '' AND REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') = REGEXP_REPLACE(COALESCE(lc.cpf,''), '[^0-9]', ''))
        )
        WHERE lc.id=${loan.clientId} LIMIT 1`);
      const client = clientRows[0] || {};
      await createFinancialSale({
        customerName: client.name || 'Cliente',
        customerPhone: (client.phone || '').replace(/\D/g, ''),
        productName: `Juros Empréstimo #EMP-${String(input.loanId).padStart(4,'0')}`,
        productOption: `Parcela #${inst.installmentNumber} ââ‚¬â€ Dívida rolada`,
        saleValue: Math.round(totalJuros * 100), // em centavos
        costValue: 0,
        paymentMethod: 'pix',
        status: 'pago',
        saleDate: Date.now(),
        receivedDate: Date.now(),
        notes: `Juros cobrados: R$ ${interestOnPrincipal.toFixed(2)} + Taxa: R$ ${feeApplied.toFixed(2)} | Principal rolado: R$ ${principalPerInstallment.toFixed(2)} | Nova parcela vence em ${newDueDate}`,
      });
    } catch (e) { console.error('[Financeiro] Erro ao registrar juros:', e); }

    // 5. Envia recibo por email ao cliente (se tiver email)
    try {
      const clientRows = await qRows(db, drizzleSql`SELECT lc.name, lc.phone, COALESCE(lc.cpf, c.cpf) as cpf, c.email
        FROM loanClients lc
        LEFT JOIN customers c ON c.deletedAt IS NULL AND (
          RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE(lc.phone, '[^0-9]', ''), 9)
          OR (REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') <> '' AND REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') = REGEXP_REPLACE(COALESCE(lc.cpf,''), '[^0-9]', ''))
        )
        WHERE lc.id=${loan.clientId} LIMIT 1`);
      const client = clientRows[0] || {};
      if (client.email) {
        const receiptNumber = `JUR-${String(input.loanId).padStart(4,'0')}-${String(inst.installmentNumber).padStart(2,'0')}-${today.replace(/-/g,'')}`;
        const emittedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const pdfBuffer = await generateReceiptPdf({
          receiptNumber,
          clientName: client.name || 'Cliente',
          clientCpf: client.cpf || undefined,
          installmentNumber: inst.installmentNumber,
          totalInstallments: parseInt(loan.installments),
          amountPaid: totalJuros.toFixed(2),
          paidAt: today,
          nextDueDate: newDueDate,
          confirmedBy: paidBy,
          emittedAt,
          originalAmount: interestOnPrincipal.toFixed(2),
          feeApplied: feeApplied > 0 ? feeApplied.toFixed(2) : undefined,
        });
        await sendReceiptEmail(client.email, client.name || 'Cliente', receiptNumber, inst.installmentNumber, pdfBuffer);
      }
    } catch (e) { console.error('[Recibo Juros] Erro ao enviar recibo:', e); }

    return { ok: true, cycleInterest: totalJuros, newDueDate, renewDays, principalPerInstallment, interestOnPrincipal, feeApplied };
  }),

  getInterestOnlyHistory: adminProcedure.input(z.object({
    loanId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`
      SELECT * FROM loanInstallments
      WHERE loanId=${input.loanId} AND status='pago_juros'
      ORDER BY installmentNumber ASC
    `);
    return rows;
  }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ DESFAZER PAGAMENTO DE JUROS ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

  undoInterestOnly: adminProcedure.input(z.object({
    loanId: z.number(),
    installmentId: z.number(), // ID da parcela com status pago_juros
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    // 1. Busca a parcela pago_juros
    const instRows = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE id=${input.installmentId} AND loanId=${input.loanId}`);
    if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const inst = instRows[0];
    if (inst.status !== 'pago_juros') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parcela não está com status pago_juros' });
    // 2. Reverte a parcela para pendente
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET status='pendente', paidAt=NULL, paidBy=NULL,
          notes=CONCAT(COALESCE(notes,''), ' | [Juros desfeitos]')
      WHERE id=${input.installmentId}
    `);
    // 3. Deleta a parcela rolada (rolled_from_interest_only) criada após esta
    // Busca a parcela com número maior que a atual e notes contendo rolled_from_interest_only
    await db.execute(drizzleSql`
      DELETE FROM loanInstallments
      WHERE loanId=${input.loanId}
        AND installmentNumber > ${inst.installmentNumber}
        AND (notes LIKE '%rolled_from_interest_only%' OR status = 'pendente')
        AND installmentNumber = (
          SELECT maxNum FROM (
            SELECT MAX(installmentNumber) as maxNum FROM loanInstallments
            WHERE loanId=${input.loanId} AND notes LIKE '%rolled_from_interest_only%'
          ) t
        )
    `);
    // 4. Restaura o vencimento do empréstimo para a última parcela pendente restante
    const lastPendRow = await qRows(db, drizzleSql`
      SELECT MAX(dueDate) as lastDue FROM loanInstallments
      WHERE loanId=${input.loanId} AND status='pendente'
    `);
    const newDueDate = lastPendRow[0]?.lastDue || inst.dueDate;
    await db.execute(drizzleSql`
      UPDATE loans SET dueDate=${newDueDate}, interestOnlyCount=GREATEST(0, interestOnlyCount-1),
        status='aprovado'
      WHERE id=${input.loanId}
    `);
    return { ok: true };
  }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ COMPROVANTES DE PAGAMENTO (ADMIN) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬

  // Confirmar pagamento manual com comprovante opcional
  confirmInstallmentPaymentWithProof: adminProcedure.input(z.object({
    installmentId: z.number(),
    amountPaid: z.number().positive(),
    paidAt: z.string(),
    observation: z.string().optional(),
    fileBase64: z.string().optional(),
    fileName: z.string().optional(),
    mimeType: z.string().optional(),
    fileSizeBytes: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const paidBy = ctx.user?.name || "admin";
    const instRows = await qRows(db, drizzleSql`
      SELECT li.*, l.clientId FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      WHERE li.id=${input.installmentId}
    `);
    if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const inst = instRows[0];
    let fileKey: string | null = null;
    let fileUrl: string | null = null;
    let hasProof = 0;
    if (input.fileBase64 && input.fileName && input.mimeType) {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${input.fileName}`;
      const key = `loan-admin-proofs/${inst.clientId}/${inst.loanId}/${input.installmentId}/${uniqueName}`;
      const result = await storagePut(key, buffer, input.mimeType);
      fileKey = result.key;
      fileUrl = result.url;
      hasProof = 1;
    }
    // Se a data selecionada for hoje, usa a hora atual (NOW()). Para datas passadas, usa meio-dia BRT (15:00 UTC = 12:00 BRT)
    const today = getBrazilToday();
    let paidAtDate: Date;
    if (!input.paidAt || input.paidAt === today) {
      paidAtDate = new Date(); // hora exata atual
    } else {
      paidAtDate = new Date(input.paidAt + 'T15:00:00Z'); // meio-dia BRT para datas passadas
    }
    await db.execute(drizzleSql`UPDATE loanInstallments SET status='pago', paidAt=${paidAtDate}, paidBy=${paidBy} WHERE id=${input.installmentId}`);
    const h2ScoreApproval = await approveH2ScoreSubmission(db, input.installmentId, paidBy);
    const permanentH2Score = h2ScoreApproval ? await applyH2ScoreEventFromSubmission(db, input.installmentId) : null;
    await db.execute(drizzleSql`
      INSERT INTO installmentProofs
        (installmentId, loanId, clientId, installmentNumber, amountPaid, paidAt, paidBy, observation, originalFileName, fileKey, fileUrl, fileMimeType, fileSizeBytes, hasProof)
      VALUES
        (${input.installmentId}, ${inst.loanId}, ${inst.clientId}, ${inst.installmentNumber}, ${input.amountPaid}, ${paidAtDate}, ${paidBy}, ${input.observation || null}, ${input.fileName || null}, ${fileKey}, ${fileUrl}, ${input.mimeType || null}, ${input.fileSizeBytes || null}, ${hasProof})
    `);
    if (hasProof) {
      const proofRows = await qRows(db, drizzleSql`SELECT id FROM installmentProofs WHERE installmentId=${input.installmentId} ORDER BY id DESC LIMIT 1`);
      if (proofRows.length) {
        await db.execute(drizzleSql`INSERT INTO installmentProofLogs (proofId, installmentId, loanId, action, performedBy, newFileKey, newFileUrl, newFileName) VALUES (${proofRows[0].id}, ${input.installmentId}, ${inst.loanId}, 'attached', ${paidBy}, ${fileKey}, ${fileUrl}, ${input.fileName || null})`);
      }
    }
    const loanId = inst.loanId;
    const pending = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=${loanId} AND status != 'pago'`);
    if (parseInt(pending[0].cnt) === 0) {
      await db.execute(drizzleSql`UPDATE loans SET status='pago', paidAt=NOW(), paidBy=${paidBy} WHERE id=${loanId}`);
    } else {
      const awaitingProof = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=${loanId} AND status IN ('aguardando_confirmacao','em_analise')`);
      if (parseInt(awaitingProof[0]?.cnt || 0) > 0) {
        await db.execute(drizzleSql`UPDATE loans SET status='aguardando_pagamento' WHERE id=${loanId}`);
      } else {
        await db.execute(drizzleSql`UPDATE loans SET status='aprovado' WHERE id=${loanId} AND status='aguardando_pagamento'`);
      }
    }
    return { ok: true, hasProof: !!hasProof, fileUrl, h2ScoreApproval, permanentH2Score };
  }),

  // Buscar comprovantes de um empréstimo (batch por loanId)
  getProofsByLoan: adminProcedure.input(z.object({
    loanId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`SELECT * FROM installmentProofs WHERE loanId=${input.loanId} ORDER BY installmentNumber ASC`);
    const map: Record<number, any> = {};
    for (const r of rows) map[r.installmentId] = r;
    return map;
  }),

  // Adicionar comprovante a pagamento já confirmado sem arquivo
  addProofToExistingPayment: adminProcedure.input(z.object({
    installmentId: z.number(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSizeBytes: z.number().optional(),
    observation: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const performedBy = ctx.user?.name || "admin";
    const instRows = await qRows(db, drizzleSql`SELECT li.*, l.clientId FROM loanInstallments li JOIN loans l ON l.id = li.loanId WHERE li.id=${input.installmentId}`);
    if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const inst = instRows[0];
    const buffer = Buffer.from(input.fileBase64, "base64");
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${input.fileName}`;
    const key = `loan-admin-proofs/${inst.clientId}/${inst.loanId}/${input.installmentId}/${uniqueName}`;
    const result = await storagePut(key, buffer, input.mimeType);
    const existing = await qRows(db, drizzleSql`SELECT * FROM installmentProofs WHERE installmentId=${input.installmentId} ORDER BY id DESC LIMIT 1`);
    if (existing.length) {
      await db.execute(drizzleSql`UPDATE installmentProofs SET originalFileName=${input.fileName}, fileKey=${result.key}, fileUrl=${result.url}, fileMimeType=${input.mimeType}, fileSizeBytes=${input.fileSizeBytes || null}, hasProof=1, observation=${input.observation || existing[0].observation} WHERE id=${existing[0].id}`);
      await db.execute(drizzleSql`INSERT INTO installmentProofLogs (proofId, installmentId, loanId, action, performedBy, newFileKey, newFileUrl, newFileName) VALUES (${existing[0].id}, ${input.installmentId}, ${inst.loanId}, 'attached', ${performedBy}, ${result.key}, ${result.url}, ${input.fileName})`);
    } else {
      await db.execute(drizzleSql`INSERT INTO installmentProofs (installmentId, loanId, clientId, installmentNumber, amountPaid, paidAt, paidBy, observation, originalFileName, fileKey, fileUrl, fileMimeType, fileSizeBytes, hasProof) VALUES (${input.installmentId}, ${inst.loanId}, ${inst.clientId}, ${inst.installmentNumber}, ${inst.amount}, ${inst.paidAt || new Date()}, ${inst.paidBy || performedBy}, ${input.observation || null}, ${input.fileName}, ${result.key}, ${result.url}, ${input.mimeType}, ${input.fileSizeBytes || null}, 1)`);
      const newProof = await qRows(db, drizzleSql`SELECT id FROM installmentProofs WHERE installmentId=${input.installmentId} ORDER BY id DESC LIMIT 1`);
      if (newProof.length) {
        await db.execute(drizzleSql`INSERT INTO installmentProofLogs (proofId, installmentId, loanId, action, performedBy, newFileKey, newFileUrl, newFileName) VALUES (${newProof[0].id}, ${input.installmentId}, ${inst.loanId}, 'attached', ${performedBy}, ${result.key}, ${result.url}, ${input.fileName})`);
      }
    }
    return { ok: true, fileUrl: result.url };
  }),

  // Substituir comprovante
  replaceInstallmentProof: adminProcedure.input(z.object({
    installmentId: z.number(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSizeBytes: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const performedBy = ctx.user?.name || "admin";
    const instRows = await qRows(db, drizzleSql`SELECT li.*, l.clientId FROM loanInstallments li JOIN loans l ON l.id = li.loanId WHERE li.id=${input.installmentId}`);
    if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const inst = instRows[0];
    const existing = await qRows(db, drizzleSql`SELECT * FROM installmentProofs WHERE installmentId=${input.installmentId} ORDER BY id DESC LIMIT 1`);
    if (!existing.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comprovante não encontrado' });
    const prev = existing[0];
    const buffer = Buffer.from(input.fileBase64, "base64");
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${input.fileName}`;
    const key = `loan-admin-proofs/${inst.clientId}/${inst.loanId}/${input.installmentId}/${uniqueName}`;
    const result = await storagePut(key, buffer, input.mimeType);
    await db.execute(drizzleSql`UPDATE installmentProofs SET originalFileName=${input.fileName}, fileKey=${result.key}, fileUrl=${result.url}, fileMimeType=${input.mimeType}, fileSizeBytes=${input.fileSizeBytes || null}, hasProof=1 WHERE id=${prev.id}`);
    await db.execute(drizzleSql`INSERT INTO installmentProofLogs (proofId, installmentId, loanId, action, performedBy, previousFileKey, previousFileUrl, previousFileName, newFileKey, newFileUrl, newFileName) VALUES (${prev.id}, ${input.installmentId}, ${inst.loanId}, 'replaced', ${performedBy}, ${prev.fileKey}, ${prev.fileUrl}, ${prev.originalFileName}, ${result.key}, ${result.url}, ${input.fileName})`);
    return { ok: true, fileUrl: result.url };
  }),

  // Excluir comprovante (não desfaz pagamento)
  deleteInstallmentProof: adminProcedure.input(z.object({
    installmentId: z.number(),
    deleteReason: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb() as any;
    const performedBy = ctx.user?.name || "admin";
    const existing = await qRows(db, drizzleSql`SELECT ip.*, li.loanId as liLoanId FROM installmentProofs ip JOIN loanInstallments li ON li.id = ip.installmentId WHERE ip.installmentId=${input.installmentId} ORDER BY ip.id DESC LIMIT 1`);
    if (!existing.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const prev = existing[0];
    await db.execute(drizzleSql`INSERT INTO installmentProofLogs (proofId, installmentId, loanId, action, performedBy, previousFileKey, previousFileUrl, previousFileName, deleteReason) VALUES (${prev.id}, ${input.installmentId}, ${prev.liLoanId}, 'deleted', ${performedBy}, ${prev.fileKey}, ${prev.fileUrl}, ${prev.originalFileName}, ${input.deleteReason || null})`);
    await db.execute(drizzleSql`UPDATE installmentProofs SET fileKey=NULL, fileUrl=NULL, originalFileName=NULL, fileMimeType=NULL, fileSizeBytes=NULL, hasProof=0 WHERE id=${prev.id}`);
    return { ok: true };
  }),

  // Histórico de comprovantes com filtros
  getProofHistory: adminProcedure.input(z.object({
    loanId: z.number().optional(),
    clientId: z.number().optional(),
    installmentId: z.number().optional(),
    hasProof: z.boolean().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb() as any;
    const conditions: string[] = ['1=1'];
    if (input.loanId) conditions.push(`ip.loanId=${input.loanId}`);
    if (input.clientId) conditions.push(`ip.clientId=${input.clientId}`);
    if (input.installmentId) conditions.push(`ip.installmentId=${input.installmentId}`);
    if (input.hasProof === true) conditions.push(`ip.hasProof=1`);
    if (input.hasProof === false) conditions.push(`ip.hasProof=0`);
    if (input.dateFrom) conditions.push(`DATE(ip.paidAt) >= '${input.dateFrom}'`);
    if (input.dateTo) conditions.push(`DATE(ip.paidAt) <= '${input.dateTo}'`);
    const where = conditions.join(' AND ');
    const rows = await qRows(db, drizzleSql`
      SELECT ip.*, lc.name as clientName, l.amount as loanAmount
      FROM installmentProofs ip
      JOIN loans l ON l.id = ip.loanId
      JOIN loanClients lc ON lc.id = ip.clientId
      WHERE ${drizzleSql.raw(where)}
      ORDER BY ip.paidAt DESC
      LIMIT 200
    `);
    return rows;
  }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ RECIBO DE PAGAMENTO ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  generateReceipt: adminProcedure.input(z.object({
    installmentId: z.number(),
  })).mutation(async ({ input }) => {
    try {
      const db = await getDb() as any;
      const instRows = await qRows(db, drizzleSql`
        SELECT li.id, li.loanId, li.installmentNumber, li.amount, li.paidAt, li.paidBy, li.status,
          li.originalAmount, li.feeApplied, li.paidAmount,
          l.clientId, l.installments as loanInstallments,
          (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id) as totalInstallments
        FROM loanInstallments li
        JOIN loans l ON l.id = li.loanId
        WHERE li.id=${input.installmentId}
      `);
      console.log('[generateReceipt] instRows count:', instRows.length, 'id:', input.installmentId);
      if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada.' });
      const inst = instRows[0];
      console.log('[generateReceipt] inst:', JSON.stringify({ id: inst.id, loanId: inst.loanId, clientId: inst.clientId, installmentNumber: inst.installmentNumber, amount: inst.amount, status: inst.status }));
      const clientRows = await qRows(db, drizzleSql`SELECT name, cpf, phone FROM loanClients WHERE id=${inst.clientId}`);
      const client = clientRows[0] || {};
      console.log('[generateReceipt] client:', JSON.stringify({ name: client.name, cpf: !!client.cpf }));
      // Tentar buscar email na tabela customers pelo telefone
      let clientEmail = '';
      if (client.phone) {
        const phoneClean = String(client.phone).replace(/\D/g, '');
        const custRows = await qRows(db, drizzleSql`SELECT email FROM customers WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(','') LIKE ${`%${phoneClean.slice(-8)}`} LIMIT 1`);
        clientEmail = custRows[0]?.email || '';
      }
      // Próximo vencimento
      const nextRows = await qRows(db, drizzleSql`
        SELECT dueDate FROM loanInstallments
        WHERE loanId=${inst.loanId} AND installmentNumber > ${inst.installmentNumber} AND status != 'pago'
        ORDER BY installmentNumber ASC LIMIT 1
      `);
      const nextDue = nextRows[0]?.dueDate ? new Date(nextRows[0].dueDate).toLocaleDateString('pt-BR') : undefined;
      // Número do recibo
      const receiptNumber = `REC-${new Date().getFullYear()}-${String(inst.loanId).padStart(4,'0')}-${String(inst.installmentNumber).padStart(3,'0')}`;
      const emittedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const paidAtStr = inst.paidAt ? new Date(inst.paidAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
      // Formatar CPF
      let cpfDisplay = client.cpf || '';
      if (cpfDisplay && cpfDisplay.replace(/\D/g,'').length === 11) {
        const d = cpfDisplay.replace(/\D/g,'');
        cpfDisplay = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
      }
      // Garantir que amount é número
      const amountNum = typeof inst.amount === 'string' ? parseFloat(inst.amount) : Number(inst.amount);
      // Para pago_juros, usar loanInstallments (parcelas originais) em vez de totalInstallments (que inclui roladas)
      const originalLoanInstallments = typeof inst.loanInstallments === 'string' ? parseInt(inst.loanInstallments) : Number(inst.loanInstallments || 0);
      const totalInst = originalLoanInstallments > 0 ? originalLoanInstallments : (typeof inst.totalInstallments === 'string' ? parseInt(inst.totalInstallments) : Number(inst.totalInstallments));
      const installNum = typeof inst.installmentNumber === 'string' ? parseInt(inst.installmentNumber) : Number(inst.installmentNumber);
      console.log('[generateReceipt] generating PDF, amount:', amountNum, 'total:', totalInst, 'installNum:', installNum, 'status:', inst.status);
      const feeAppliedNum = inst.feeApplied != null ? parseFloat(String(inst.feeApplied)) : 0;
      const originalAmountNum = inst.originalAmount != null ? parseFloat(String(inst.originalAmount)) : null;
      // Para parcelas pago_juros: usar paidAmount (valor dos juros cobrados) como amountPaid
      const isInterestOnly = inst.status === 'pago_juros';
      const paidAmountNum = inst.paidAmount != null ? parseFloat(String(inst.paidAmount)) : null;
      const receiptAmountPaid = isInterestOnly && paidAmountNum != null ? paidAmountNum : amountNum;
      const pdfBuffer = await generateReceiptPdf({
        receiptNumber: isInterestOnly ? receiptNumber.replace('REC-', 'JUR-') : receiptNumber,
        clientName: client.name || 'Cliente',
        clientCpf: cpfDisplay || undefined,
        installmentNumber: installNum,
        totalInstallments: totalInst,
        amountPaid: String(receiptAmountPaid),
        paidAt: paidAtStr,
        nextDueDate: nextDue,
        confirmedBy: (inst.paidBy || '').replace(/CSA TRANSPORTES LTDA/gi, 'CSA EMPRESTIMOS SP') || undefined,
        emittedAt,
        originalAmount: isInterestOnly ? undefined : (originalAmountNum != null ? String(originalAmountNum) : undefined),
        feeApplied: isInterestOnly ? (feeAppliedNum > 0 ? String(feeAppliedNum) : undefined) : (feeAppliedNum > 0 ? String(feeAppliedNum) : undefined),
        isInterestOnly,
      });
      console.log('[generateReceipt] PDF generated, size:', pdfBuffer.length);
      // Upload para S3
      const key = `loan-receipts/${inst.clientId || 0}/${inst.loanId || 0}/${input.installmentId}/${receiptNumber}.pdf`;
      const { url } = await storagePut(key, pdfBuffer, 'application/pdf');
      console.log('[generateReceipt] uploaded to S3, url:', url);
      // Gerar JPG a partir do PDF
      let jpgUrl = '';
      try {
        const jpgBuffer = await generateReceiptJpg(pdfBuffer);
        const jpgKey = `loan-receipts/${inst.clientId || 0}/${inst.loanId || 0}/${input.installmentId}/${receiptNumber}.jpg`;
        const { url: jUrl } = await storagePut(jpgKey, jpgBuffer, 'image/jpeg');
        jpgUrl = jUrl;
        console.log('[generateReceipt] JPG uploaded, url:', jpgUrl);
      } catch (jpgErr: any) {
        console.warn('[generateReceipt] JPG generation failed (non-fatal):', jpgErr?.message);
      }
      return {
        receiptNumber,
        pdfUrl: url,
        jpgUrl,
        clientName: client.name || 'Cliente',
        clientPhone: client.phone || '',
        clientEmail: clientEmail,
        installmentNumber: installNum,
        totalInstallments: totalInst,
        amountPaid: String(amountNum),
        paidAt: paidAtStr,
        nextDueDate: nextDue,
        originalAmount: originalAmountNum != null ? String(originalAmountNum) : null,
        feeApplied: feeAppliedNum > 0 ? String(feeAppliedNum) : null,
      };
    } catch (e: any) {
      console.error('[generateReceipt] ERROR:', e?.message || e, e?.stack?.split('\n').slice(0,5).join(' | '));
      if (e instanceof TRPCError) throw e;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e?.message || 'Erro ao gerar recibo.' });
    }
  }),

  sendReceiptByEmail: adminProcedure.input(z.object({
    installmentId: z.number(),
    emailOverride: z.string().email().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const instRows = await qRows(db, drizzleSql`
      SELECT li.*, l.clientId,
        (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id) as totalInstallments
      FROM loanInstallments li JOIN loans l ON l.id = li.loanId
      WHERE li.id=${input.installmentId}
    `);
    if (!instRows.length) throw new TRPCError({ code: 'NOT_FOUND' });
    const inst = instRows[0];
    const clientRows = await qRows(db, drizzleSql`SELECT name, cpf, phone FROM loanClients WHERE id=${inst.clientId}`);
    const client = clientRows[0] || {};
    // Buscar email via customers pelo telefone
    let clientEmail = '';
    if (client.phone) {
      const phoneClean = String(client.phone).replace(/\D/g, '');
      const custRows = await qRows(db, drizzleSql`SELECT email FROM customers WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(','') LIKE ${`%${phoneClean.slice(-8)}`} LIMIT 1`);
      clientEmail = custRows[0]?.email || '';
    }
    const toEmail = input.emailOverride || clientEmail;
    if (!toEmail) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente sem e-mail cadastrado.' });
    const nextRows = await qRows(db, drizzleSql`SELECT dueDate FROM loanInstallments WHERE loanId=${inst.loanId} AND installmentNumber > ${inst.installmentNumber} AND status != 'pago' ORDER BY installmentNumber ASC LIMIT 1`);
    const nextDue = nextRows[0]?.dueDate ? new Date(nextRows[0].dueDate).toLocaleDateString('pt-BR') : undefined;
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(inst.loanId).padStart(4,'0')}-${String(inst.installmentNumber).padStart(3,'0')}`;
    const emittedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const paidAtStr = inst.paidAt ? new Date(inst.paidAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    let cpfDisplay = client.cpf || '';
    if (cpfDisplay && cpfDisplay.replace(/\D/g,'').length === 11) {
      const d = cpfDisplay.replace(/\D/g,'');
      cpfDisplay = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    }
    const feeAppliedEmail = inst.feeApplied != null ? parseFloat(String(inst.feeApplied)) : 0;
    const originalAmountEmail = inst.originalAmount != null ? parseFloat(String(inst.originalAmount)) : null;
    const pdfBuffer = await generateReceiptPdf({
      receiptNumber, clientName: client.name || 'Cliente', clientCpf: cpfDisplay || undefined,
      installmentNumber: inst.installmentNumber, totalInstallments: inst.totalInstallments,
      amountPaid: inst.amount, paidAt: paidAtStr, nextDueDate: nextDue,
      confirmedBy: (inst.paidBy || '').replace(/CSA TRANSPORTES LTDA/gi, 'CSA EMPRESTIMOS SP') || undefined,
      emittedAt,
      originalAmount: originalAmountEmail != null ? String(originalAmountEmail) : undefined,
      feeApplied: feeAppliedEmail > 0 ? String(feeAppliedEmail) : undefined,
    });
    await sendReceiptEmail(toEmail, client.name || 'Cliente', receiptNumber, inst.installmentNumber, pdfBuffer);
    return { ok: true, sentTo: toEmail };
  }),

  // ââ€â‚¬ââ€â‚¬ EXTRATO COMPLETO DO EMPRÉSTIMO ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  generateLoanStatement: adminProcedure.input(z.object({
    loanId: z.number(),
  })).mutation(async ({ input }) => {
    console.log('[generateLoanStatement] START loanId:', input.loanId);
    const db = await getDb() as any;
    // Buscar dados do empréstimo + cliente
    console.log('[generateLoanStatement] querying loan...');
    const loanRows = await qRows(db, drizzleSql`
      SELECT l.*, lc.name as clientName, lc.phone as clientPhone, lc.cpf as clientCpf,
        lc.profileSlug, lc.creditLimit as clientCreditLimit, lc.interestRate as clientInterestRate,
        c.email as clientEmail, c.cpf as customerCpf, c.profilePhotoUrl as clientPhoto
      FROM loans l
      JOIN loanClients lc ON lc.id = l.clientId
      LEFT JOIN customers c ON c.phone = lc.phone AND c.deletedAt IS NULL
      WHERE l.id=${input.loanId}
    `);
    console.log('[generateLoanStatement] loanRows count:', loanRows.length);
    if (!loanRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    const loan = loanRows[0];
    console.log('[generateLoanStatement] loan found, clientName:', loan.clientName);
    // Buscar parcelas
    const installments = await qRows(db, drizzleSql`
      SELECT * FROM loanInstallments WHERE loanId=${input.loanId} ORDER BY installmentNumber ASC
    `);
    // Buscar perfil atual e próximo
    const allProfiles = await qRows(db, drizzleSql`SELECT * FROM loanProfiles WHERE isActive=1 ORDER BY sortOrder ASC`);
    const currentProfile = allProfiles.find((p: any) => p.slug === loan.profileSlug) || allProfiles[0];
    const currentIdx = allProfiles.findIndex((p: any) => p.slug === loan.profileSlug);
    const nextProfile = currentIdx >= 0 && currentIdx < allProfiles.length - 1 ? allProfiles[currentIdx + 1] : null;
    // Calcular totais
    const paidInstallments = installments.filter((i: any) => i.status === 'pago');
    const totalPaid = paidInstallments.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0);
    const totalAmount = parseFloat(loan.totalAmount || 0);
    const remaining = Math.max(0, totalAmount - totalPaid);
    const overdueCount = installments.filter((i: any) => i.status !== 'pago' && i.status !== 'cancelado' && i.dueDate < getBrazilToday()).length;
    const progressPct = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0;
    const emittedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const docId = `EXT-${new Date().getFullYear()}-${String(input.loanId).padStart(4, '0')}`;
    // Formatar CPF
    const rawCpf = (loan.clientCpf || loan.customerCpf || '').replace(/\D/g, '');
    const cpfFmt = rawCpf.length === 11 ? `${rawCpf.slice(0,3)}.${rawCpf.slice(3,6)}.${rawCpf.slice(6,9)}-${rawCpf.slice(9)}` : (rawCpf || 'Não informado');
    const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR') : 'ââ‚¬â€';
    const statusLabel: Record<string, string> = { aprovado: 'Aprovado', pendente: 'Aguardando Aprovação', reprovado: 'Reprovado', cancelado: 'Cancelado', pago: 'Pago' };
    const payTypeLabel: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
    const profileEmoji: Record<string, string> = { bronze: '', prata: '', ouro: '', diamante: '' };
    console.log('[generateLoanStatement] installments count:', installments.length, 'profiles:', allProfiles.length);
    // Gerar HTML do extrato
    const installmentsRows = installments.map((inst: any) => {
      const isOverdue = inst.status !== 'pago' && inst.status !== 'cancelado' && inst.dueDate < getBrazilToday();
      const statusKey = isOverdue ? 'atrasado' : inst.status;
      const pillColor: Record<string, string> = { pago: 'background:#dcfce7;color:#15803d', pendente: 'background:#fef9c3;color:#854d0e', atrasado: 'background:#fee2e2;color:#b91c1c', em_analise: 'background:#dbeafe;color:#1d4ed8', cancelado: 'background:#f1f5f9;color:#64748b' };
      const pillLabel: Record<string, string> = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', em_analise: 'Em Análise', cancelado: 'Cancelado' };
      const pStyle = pillColor[statusKey] || pillColor.pendente;
      const pLabel = pillLabel[statusKey] || inst.status;
      const paidAtStr = inst.paidAt ? fmtDate(inst.paidAt.toString().slice(0, 10)) : '&mdash;';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#374151;"><strong>${inst.installmentNumber}</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#374151;">${fmtDate(inst.dueDate)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#374151;"><strong>${fmtBRL(parseFloat(inst.amount))}</strong></td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#374151;">${paidAtStr}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;"><span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:9px;font-weight:700;${pStyle}">${pLabel}</span></td>
      </tr>`;
    }).join('');
    const upgradeSection = nextProfile ? `
      <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%"><tr><td width="36" style="vertical-align:top;font-size:26px;">★</td><td>
          <p style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 6px;">Parabéns! Você está no caminho certo, ${loan.clientName.split(' ')[0]}!</p>
          <p style="font-size:11px;color:#78350f;line-height:1.6;margin:0 0 10px;">Você está no perfil <strong>${currentProfile?.name || loan.profileSlug}</strong> com limite de <strong>${fmtBRL(parseFloat(loan.clientCreditLimit || 0))}</strong>. Mantendo seus pagamentos em dia, você sobe de categoria <strong>automaticamente</strong> e ganha acesso a limites maiores e taxas menores!</p>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="background:#e2e8f0;color:#475569;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${profileEmoji[loan.profileSlug] || '★'} ${currentProfile?.name || loan.profileSlug}</span>
            <span style="color:#d97706;font-size:14px;">&rarr;</span>
            <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid #fcd34d;">${profileEmoji[nextProfile.slug] || ''} ${nextProfile.name}</span>
            <span style="font-size:10px;color:#16a34a;font-weight:600;">&#10004; Limite até ${fmtBRL(parseFloat(nextProfile.creditLimit))} &middot; Juros a partir de ${nextProfile.interestRate}%</span>
          </div>
        </td></tr></table>
      </div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="font-size:11px;font-weight:700;color:#15803d;margin:0 0 8px;"> Como subir de categoria automaticamente:</p>
        <ul style="font-size:10px;color:#166534;line-height:1.8;padding-left:16px;margin:0;">
          <li>Pague todas as parcelas no prazo (sem atrasos)</li>
          <li>Mantenha bom histórico por pelo menos 2 empréstimos consecutivos</li>
          <li>Não tenha parcelas em aberto vencidas</li>
          <li>A promoção de categoria é feita automaticamente pelo sistema</li>
        </ul>
      </div>` : `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <p style="font-size:12px;font-weight:700;color:#15803d;margin:0 0 4px;">  Você está no nível máximo!</p>
        <p style="font-size:11px;color:#166534;margin:0;">Continue mantendo seus pagamentos em dia para preservar seus benefícios exclusivos.</p>
      </div>`;
    const stampColor = loan.status === 'pago' ? '#16a34a' : loan.status === 'reprovado' ? '#dc2626' : loan.status === 'cancelado' ? '#64748b' : '#2563eb';
    const stampText = (statusLabel[loan.status] || loan.status).toUpperCase();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;color:#1e293b;padding:20px;margin:0;}
  .page{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%);padding:24px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f59e0b;}
  .body{padding:22px 32px;}
  .sec{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;display:flex;align-items:center;gap:6px;}
  .sec::after{content:'';flex:1;height:1px;background:#e2e8f0;}
  table.inst{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;}
  table.inst thead tr{background:#0f172a;color:#fff;}
  table.inst thead th{padding:9px 10px;text-align:left;font-weight:600;font-size:10px;}
  table.inst thead th:last-child{text-align:center;}
  table.inst tbody tr:nth-child(even){background:#f8fafc;}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;display:flex;justify-content:space-between;align-items:center;}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div><h1 style="color:#f59e0b;font-size:20px;font-weight:800;margin:0;">CSA EMPRÉSTIMOS SP</h1><p style="color:#94a3b8;font-size:11px;margin:3px 0 0;">h2colombiano.com</p></div>
    <div style="text-align:right;"><div style="color:#fff;font-size:13px;font-weight:600;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);padding:4px 12px;border-radius:20px;">EXTRATO DE EMPRÉSTIMO</div><div style="color:#64748b;font-size:10px;margin-top:5px;">Emitido em: ${emittedAt}</div></div>
  </div>
  <div class="body">
    <div class="sec">DADOS DO CLIENTE</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
      <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;">${loan.clientName.charAt(0).toUpperCase()}</div>
      <div style="flex:1;">
        <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0;">${loan.clientName}</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:5px;">
          ${loan.clientPhone ? `<span style="font-size:11px;color:#475569;"> ${loan.clientPhone}</span>` : ''}
          ${cpfFmt !== 'Não informado' ? `<span style="font-size:11px;color:#475569;">CPF: ${cpfFmt}</span>` : ''}
          ${loan.clientEmail ? `<span style="font-size:11px;color:#475569;"> ${loan.clientEmail}</span>` : ''}
        </div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;background:#e2e8f0;color:#475569;border:1px solid #cbd5e1;">${profileEmoji[loan.profileSlug] || '★'} ${(currentProfile?.name || loan.profileSlug).toUpperCase()}</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px;">Limite atual</div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;">${fmtBRL(parseFloat(loan.clientCreditLimit || 0))}</div>
      </div>
    </div>
    <div class="sec">RESUMO FINANCEIRO</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Valor Solicitado</div><div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:3px;">${fmtBRL(parseFloat(loan.amount))}</div><div style="font-size:9px;color:#94a3b8;">Principal</div></div>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Juros (${loan.interestRate}%)</div><div style="font-size:17px;font-weight:800;color:#dc2626;margin-top:3px;">${fmtBRL(parseFloat(loan.interestAmount || 0))}</div><div style="font-size:9px;color:#94a3b8;">Taxa aplicada</div></div>
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Total c/ Juros</div><div style="font-size:17px;font-weight:800;color:#d97706;margin-top:3px;">${fmtBRL(totalAmount)}</div><div style="font-size:9px;color:#94a3b8;">Valor total</div></div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Total Pago</div><div style="font-size:17px;font-weight:800;color:#16a34a;margin-top:3px;">${fmtBRL(totalPaid)}</div><div style="font-size:9px;color:#94a3b8;">${paidInstallments.length} parcela(s) paga(s)</div></div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Saldo Restante</div><div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:3px;">${fmtBRL(remaining)}</div><div style="font-size:9px;color:#94a3b8;">${installments.length - paidInstallments.length} parcela(s)</div></div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center;"><div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Parcelas</div><div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:3px;">${paidInstallments.length} / ${installments.length}</div><div style="font-size:9px;color:#94a3b8;">Pagas / Total</div></div>
    </div>
    <div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:11px;color:#475569;font-weight:500;">Progresso do pagamento</span><strong style="font-size:12px;color:#0f172a;">${progressPct}% concluído</strong></div>
      <div style="background:#e2e8f0;border-radius:20px;height:10px;overflow:hidden;"><div style="height:100%;border-radius:20px;background:linear-gradient(90deg,#16a34a,#22c55e);width:${progressPct}%;"></div></div>
    </div>
    <div class="sec">DETALHES DO EMPRÉSTIMO</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">N&ordm; do Empréstimo</span><span style="font-size:11px;font-weight:700;">#EMP-${String(input.loanId).padStart(4,'0')}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Status</span><span style="font-size:11px;font-weight:700;color:${loan.status==='aprovado'?'#16a34a':loan.status==='reprovado'?'#dc2626':'#d97706'};">${statusLabel[loan.status] || loan.status}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Data de Liberação</span><span style="font-size:11px;font-weight:700;">${fmtDate(loan.releaseDate)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Data de Vencimento</span><span style="font-size:11px;font-weight:700;">${fmtDate(loan.dueDate)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Tipo de Pagamento</span><span style="font-size:11px;font-weight:700;">${payTypeLabel[loan.paymentType] || loan.paymentType}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Taxa de Juros</span><span style="font-size:11px;font-weight:700;">${loan.interestRate}% a.m.</span></div>
      ${loan.approvedBy ? `<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Aprovado por</span><span style="font-size:11px;font-weight:700;">${loan.approvedBy}</span></div>` : ''}
      ${loan.notes ? `<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;"><span style="font-size:10px;color:#64748b;">Observações</span><span style="font-size:11px;font-weight:700;">${loan.notes}</span></div>` : ''}
    </div>
    <div class="sec">HISTÓRICO DE PARCELAS</div>
    <table class="inst">
      <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Pago em</th><th>Status</th></tr></thead>
      <tbody>${installmentsRows}</tbody>
    </table>
    <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin-bottom:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
      <div style="text-align:center;"><div style="font-size:9px;color:#64748b;text-transform:uppercase;">Total Pago</div><div style="font-size:15px;font-weight:800;color:#22c55e;margin-top:3px;">${fmtBRL(totalPaid)}</div></div>
      <div style="text-align:center;"><div style="font-size:9px;color:#64748b;text-transform:uppercase;">Saldo Devedor</div><div style="font-size:15px;font-weight:800;color:#f59e0b;margin-top:3px;">${fmtBRL(remaining)}</div></div>
      <div style="text-align:center;"><div style="font-size:9px;color:#64748b;text-transform:uppercase;">Parcelas em Atraso</div><div style="font-size:15px;font-weight:800;color:${overdueCount>0?'#f87171':'#22c55e'};margin-top:3px;">${overdueCount}</div></div>
    </div>
    <div class="sec">SEU PERFIL &amp; PRÓXIMO NÍVEL</div>
    ${upgradeSection}
  </div>
  <div class="footer">
    <div><p style="font-size:9px;color:#94a3b8;">CSA Empréstimos SP &middot; h2colombiano.com &middot; h2@h2colombiano.com</p><p style="font-size:9px;color:#94a3b8;margin-top:3px;">Documento gerado automaticamente. Válido como comprovante de situação do empréstimo.</p></div>
    <div style="text-align:right;"><div style="display:inline-block;border:2px solid ${stampColor};color:${stampColor};font-size:11px;font-weight:800;padding:3px 12px;border-radius:4px;letter-spacing:1px;transform:rotate(-3deg);">${stampText}</div><div style="font-size:9px;color:#cbd5e1;margin-top:6px;font-family:monospace;">${docId}</div></div>
  </div>
</div></body></html>`;
    console.log('[generateLoanStatement] HTML generated, length:', html.length);
    // Gerar PDF via weasyprint (disponível no servidor)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stmt-'));
    const htmlPath = path.join(tmpDir, 'statement.html');
    const pdfPath = path.join(tmpDir, 'statement.pdf');
    let pdfBuffer: Buffer;
    try {
      fs.writeFileSync(htmlPath, html, 'utf8');
      try {
        const wpBin = '/usr/local/bin/weasyprint';
        execSync(`${wpBin} "${htmlPath}" "${pdfPath}"`, { timeout: 45000, maxBuffer: 50 * 1024 * 1024, env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin' } });
      } catch (wpErr: any) {
        console.error('[generateLoanStatement] weasyprint error:', wpErr?.message, wpErr?.stderr?.toString?.());
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao gerar PDF: ' + (wpErr?.message || 'erro desconhecido') });
      }
      if (!fs.existsSync(pdfPath)) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PDF não foi gerado pelo weasyprint' });
      }
      pdfBuffer = fs.readFileSync(pdfPath);
      console.log('[generateLoanStatement] PDF generated, size:', pdfBuffer.length);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
    // Upload para S3
    const fileKey = `loan-statements/${input.loanId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    // Retornar URL + dados para WhatsApp
    const phone = loan.clientPhone ? loan.clientPhone.replace(/\D/g, '') : null;
    const waMsg = `Olá ${loan.clientName}! Segue o extrato completo do seu empréstimo #EMP-${String(input.loanId).padStart(4,'0')}.\n\nValor: ${fmtBRL(parseFloat(loan.amount))} | Total c/ juros: ${fmtBRL(totalAmount)}\nPago: ${fmtBRL(totalPaid)} | Saldo: ${fmtBRL(remaining)}\n\nAcesse o PDF: ${url}\n\nEm caso de dúvidas, entre em contato conosco.`;
    const whatsappUrl = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(waMsg)}` : null;
    return { ok: true, pdfUrl: url, docId, clientName: loan.clientName, clientPhone: loan.clientPhone, clientEmail: loan.clientEmail, whatsappUrl, pdfBuffer: pdfBuffer.toString('base64') };
  }),

  sendLoanStatementByEmail: adminProcedure.input(z.object({
    loanId: z.number(),
    emailOverride: z.string().optional(),
    pdfBase64: z.string(),
    docId: z.string(),
    clientName: z.string(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    // Buscar e-mail se não fornecido
    let toEmail = input.emailOverride || null;
    if (!toEmail) {
      const loanRows = await qRows(db, drizzleSql`SELECT lc.phone FROM loans l JOIN loanClients lc ON lc.id=l.clientId WHERE l.id=${input.loanId}`);
      if (loanRows.length && loanRows[0].phone) {
        const custRows = await qRows(db, drizzleSql`SELECT email FROM customers WHERE phone=${loanRows[0].phone} AND deletedAt IS NULL LIMIT 1`);
        if (custRows.length) toEmail = custRows[0].email;
      }
    }
    if (!toEmail) throw new TRPCError({ code: 'BAD_REQUEST', message: 'E-mail do cliente não encontrado. Informe o e-mail manualmente.' });
    const pdfBuffer = Buffer.from(input.pdfBase64, 'base64');
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com', port: 465, secure: true,
      auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
    });
    await transporter.sendMail({
      from: '"CSA Empréstimos SP" <h2@h2colombiano.com>',
      to: toEmail,
      subject: `Extrato do seu Empréstimo ââ‚¬â€ ${input.docId} | CSA Empréstimos SP`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;"><div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;"><h2 style="color:#f59e0b;margin:0;">CSA Empréstimos SP</h2><p style="color:#94a3b8;margin:4px 0 0;">Extrato de Empréstimo</p></div><div style="background:#f8fafc;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;"><p style="color:#0f172a;">Olá, <strong>${input.clientName}</strong>!</p><p style="color:#374151;">Segue em anexo o extrato completo do seu empréstimo <strong>${input.docId}</strong>.</p><p style="color:#374151;">O documento contém todas as informações do empréstimo, histórico de parcelas e detalhes do seu perfil de crédito.</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"><p style="color:#6b7280;font-size:12px;">CSA Empréstimos SP ââ‚¬â€ Atendimento ao cliente</p></div></div>`,
      attachments: [{ filename: `extrato-${input.docId}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    return { ok: true, sentTo: toEmail };
  }),

  // Stats de comprovantes para o dashboard
  // Aplica taxa de atraso pré-estabelecida a uma parcela (admin)
  applyLateFeeToInstallment: adminProcedure.input(z.object({
    installmentId: z.number(),
    feeAmount: z.number().min(0),
    feeNote: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const inst = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE id=${input.installmentId}`);
    if (!inst.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = inst[0];
    if (current.status === 'pago') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parcela já está paga' });
    // Taxa de atraso manual só pode ser aplicada após o vencimento, no horário do Brasil.
    // Esta barreira é no servidor para impedir chamadas diretas fora da interface ADM.
    const dueDateValue = current.dueDate;
    const dueDate = typeof dueDateValue === 'string'
      ? dueDateValue.slice(0, 10)
      : new Date(dueDateValue).toISOString().slice(0, 10);
    if (dueDate >= getBrazilToday()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Taxa de atraso só pode ser aplicada após o vencimento da parcela.',
      });
    }
    // Salva o valor original se ainda não foi salvo
    const originalAmount = current.originalAmount != null ? parseFloat(current.originalAmount) : parseFloat(current.amount);
    const newAmount = originalAmount + input.feeAmount;
    const note = input.feeNote || `Taxa de atraso: +R$ ${input.feeAmount.toFixed(2).replace('.', ',')} aplicada em ${new Date().toLocaleDateString('pt-BR')}`;
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)}, feeApplied=${input.feeAmount.toFixed(2)}, notes=${note}
      WHERE id=${input.installmentId}
    `);
    return { ok: true, originalAmount, feeAmount: input.feeAmount, newAmount };
  }),

  // Remove taxa de atraso de uma parcela (restaura valor original)
  removeLateFeeFromInstallment: adminProcedure.input(z.object({
    installmentId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const inst = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE id=${input.installmentId}`);
    if (!inst.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcela não encontrada' });
    const current = inst[0];
    if (current.status === 'pago') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parcela já está paga' });
    if (current.originalAmount == null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma taxa aplicada nesta parcela' });
    const originalAmount = parseFloat(current.originalAmount);
    await db.execute(drizzleSql`
      UPDATE loanInstallments
      SET amount=${originalAmount.toFixed(2)}, originalAmount=NULL, feeApplied=NULL, notes=NULL
      WHERE id=${input.installmentId}
    `);
    return { ok: true, restoredAmount: originalAmount };
  }),

  // Corrige taxas históricas previamente auditadas, preservando comprovantes, recibos, datas e status.
  correctHistoricalLateFees: adminProcedure.input(z.object({
    corrections: z.array(z.object({
      installmentId: z.number(),
      feeAmount: z.number().min(0),
      reason: z.string().min(1).max(500),
    })).min(1).max(50),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const corrected: Array<{ installmentId: number; originalAmount: number; feeAmount: number; newAmount: number; status: string }> = [];

    for (const correction of input.corrections) {
      const rows = await qRows(db, drizzleSql`SELECT * FROM loanInstallments WHERE id=${correction.installmentId}`);
      if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: `Parcela ${correction.installmentId} não encontrada` });
      const current = rows[0];
      if (!current.proofSentAt) throw new TRPCError({ code: 'BAD_REQUEST', message: `Parcela ${correction.installmentId} não possui comprovante enviado` });
      if (!['pago', 'em_analise'].includes(current.status)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Status não elegível para correção histórica: ${current.status}` });
      if (current.originalAmount != null || current.feeApplied != null) throw new TRPCError({ code: 'BAD_REQUEST', message: `Parcela ${correction.installmentId} já possui taxa registrada` });

      const originalAmount = parseFloat(current.amount);
      const newAmount = Math.round((originalAmount + correction.feeAmount) * 100) / 100;
      const note = `Correção histórica de taxa: +R$ ${correction.feeAmount.toFixed(2).replace('.', ',')}. ${correction.reason}`;
      await db.execute(drizzleSql`
        UPDATE loanInstallments
        SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)},
            feeApplied=${correction.feeAmount.toFixed(2)}, notes=${note}
        WHERE id=${correction.installmentId}
      `);
      corrected.push({ installmentId: correction.installmentId, originalAmount, feeAmount: correction.feeAmount, newAmount, status: current.status });
    }

    return { ok: true, corrected };
  }),

  // Gerar PDF de oferta de empréstimo pré-aprovado e retornar link WhatsApp
  generateLoanOffer: adminProcedure.input(z.object({
    clientPhone: z.string(),
    offerAmount: z.number().positive(),
    paymentType: z.enum(["diario", "semanal", "mensal", "quinzenal"]).default("diario"),
    workDays: z.enum(["seg_sab", "seg_dom"]).default("seg_sab"),
    customMessage: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const rawPhone = input.clientPhone.replace(/\D/g, '');
    // Buscar cliente na tabela loanClients pelo telefone
    const clientRows = await qRows(db, drizzleSql`SELECT * FROM loanClients WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(','') LIKE ${`%${rawPhone.slice(-8)}`} LIMIT 1`);
    let clientName = input.clientPhone;
    let interestRate = 10;
    let maxDays = 30;
    if (clientRows.length) {
      clientName = clientRows[0].name || clientName;
      interestRate = parseFloat(clientRows[0].interestRate) || 10;
      const ptMap: Record<string, string> = { diario: 'maxDays', semanal: 'maxDaysSemanal', quinzenal: 'maxDaysQuinzenal', mensal: 'maxDaysMensal' };
      maxDays = parseInt(clientRows[0][ptMap[input.paymentType]] || clientRows[0].maxDays) || 30;
    }
    const today = getBrazilToday();
    const sim = simulateLoan(input.offerAmount, interestRate, input.paymentType, maxDays, input.workDays, today);
    const { totalAmount, perInstallment: installmentValue, installments } = sim;
    const offerAmount = input.offerAmount;
    const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const docId = `OFERTA-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f1f5f9;}.wrap{max-width:600px;margin:0 auto;background:#fff;}.header{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 28px;text-align:center;}.logo{font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;margin-bottom:4px;}.tagline{font-size:11px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase;}.badge{display:inline-block;background:#22c55e;color:#fff;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;margin-top:12px;letter-spacing:1px;}.hero{background:#0f172a;padding:28px;text-align:center;}.hero-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}.hero-value{font-size:42px;font-weight:900;color:#22c55e;line-height:1;}.hero-sub{font-size:13px;color:#94a3b8;margin-top:6px;}.client-box{background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:20px 28px;}.client-name{font-size:18px;font-weight:800;color:#1e293b;}.client-label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:0 28px 20px;}.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;}.stat-label{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}.stat-value{font-size:15px;font-weight:800;color:#1e293b;}.msg-box{background:#eff6ff;border-left:4px solid #2563eb;padding:14px 20px;margin:0 28px 20px;border-radius:0 8px 8px 0;}.msg-text{font-size:13px;color:#1e40af;line-height:1.6;}.footer{background:#0f172a;padding:16px 28px;text-align:center;}.footer p{font-size:9px;color:#475569;margin:2px 0;}.stamp{display:inline-block;border:2px solid #22c55e;color:#22c55e;font-size:12px;font-weight:800;padding:4px 14px;border-radius:4px;letter-spacing:2px;transform:rotate(-3deg);margin-top:8px;}.valid{font-size:10px;color:#64748b;margin-top:8px;}</style></head><body><div class="wrap"><div class="header"><div class="logo">CSA EMPRESTIMOS SP</div><div class="tagline">h2colombiano.com</div><div class="badge">CREDITO PRE-APROVADO</div></div><div class="hero"><div class="hero-label">Valor disponivel para voce</div><div class="hero-value">${fmtBRL(offerAmount)}</div><div class="hero-sub">${installments}x de ${fmtBRL(installmentValue)} - ${interestRate}% a.m.</div></div><div class="client-box"><div class="client-label">Oferta exclusiva para</div><div class="client-name">${clientName}</div></div><div class="grid"><div class="stat"><div class="stat-label">Valor</div><div class="stat-value">${fmtBRL(offerAmount)}</div></div><div class="stat"><div class="stat-label">Parcelas</div><div class="stat-value">${installments}x</div></div><div class="stat"><div class="stat-label">Parcela</div><div class="stat-value">${fmtBRL(installmentValue)}</div></div><div class="stat"><div class="stat-label">Total</div><div class="stat-value">${fmtBRL(totalAmount)}</div></div><div class="stat"><div class="stat-label">Juros</div><div class="stat-value">${interestRate}% a.m.</div></div><div class="stat"><div class="stat-label">Valido ate</div><div class="stat-value" style="font-size:11px;">${validUntil.toLocaleDateString('pt-BR')}</div></div></div>${input.customMessage ? `<div class="msg-box"><div class="msg-text">${input.customMessage}</div></div>` : ''}<div class="footer"><p>CSA Emprestimos SP - h2colombiano.com - h2@h2colombiano.com</p><p>Oferta gerada em ${now.toLocaleString('pt-BR')} - Ref: ${docId}</p><div class="stamp">PRE-APROVADO</div><div class="valid">Valido ate ${validUntil.toLocaleDateString('pt-BR')}. Sujeito a analise de credito.</div></div></div></body></html>`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-'));
    const htmlPath = path.join(tmpDir, 'offer.html');
    const pdfPath = path.join(tmpDir, 'offer.pdf');
    let pdfBuffer: Buffer;
    try {
      fs.writeFileSync(htmlPath, html, 'utf8');
      const wpBin = '/usr/local/bin/weasyprint';
      execSync(`${wpBin} "${htmlPath}" "${pdfPath}"`, { timeout: 45000, maxBuffer: 50 * 1024 * 1024, env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin' } });
      if (!fs.existsSync(pdfPath)) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PDF nao gerado' });
      pdfBuffer = fs.readFileSync(pdfPath);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
    const fileKey = `loan-offers/${rawPhone}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    const paymentTypeLabel = input.paymentType === 'diario' ? 'Diário' : input.paymentType === 'semanal' ? 'Semanal' : input.paymentType === 'quinzenal' ? 'Quinzenal' : 'Mensal';
    const defaultMsg = `Ola ${clientName}!\n\nVoce tem um *CREDITO PRE-APROVADO* esperando por voce!\n\nValor: *${fmtBRL(offerAmount)}*\n${installments}x de *${fmtBRL(installmentValue)}* (${paymentTypeLabel})\nJuros: ${interestRate}% a.m.\n\nVeja sua proposta completa:\n${url}\n\nOferta valida por 7 dias. Entre em contato para liberar seu credito!`;
    const waMsg = input.customMessage ? `${input.customMessage}\n\nProposta: ${url}` : defaultMsg;
    const whatsappUrl = `https://wa.me/55${rawPhone}?text=${encodeURIComponent(waMsg)}`;
    return { ok: true, pdfUrl: url, whatsappUrl, clientName, installmentValue, totalAmount, installments, interestRate };
  }),

  // Reconstrói a grade diária sem carência, preservando pagamentos e comprovantes em análise.
  // Uso administrativo para registros que sofreram duplicação antes da proteção de edição.
  rebuildDailySchedule: adminProcedure.input(z.object({
    loanId: z.number().int().positive(),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const loanRows = await qRows(db, drizzleSql`SELECT * FROM loans WHERE id=${input.loanId} LIMIT 1`);
    if (!loanRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    const loan = loanRows[0];
    if (loan.paymentType !== 'diario') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reconstrução disponível apenas para empréstimos diários' });

    const schedule = generateInstallments(
      String(loan.releaseDate).slice(0, 10),
      'diario',
      Number(loan.installments),
      Number(loan.totalAmount),
      loan.workDays === 'seg_dom' ? 'seg_dom' : loan.workDays === 'custom' ? 'custom' : 'seg_sab'
    );
    const expectedByNumber = new Map(schedule.map((item) => [item.installmentNumber, item]));
    const rows = await qRows(db, drizzleSql`
      SELECT * FROM loanInstallments WHERE loanId=${input.loanId}
      ORDER BY installmentNumber ASC, id ASC
    `);
    const protectedRows = rows.filter((row: any) => ['pago', 'em_analise'].includes(String(row.status)));
    const protectedNumbers = new Set<number>();
    for (const row of protectedRows) {
      const number = Number(row.installmentNumber);
      if (protectedNumbers.has(number)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Há mais de uma parcela protegida de número ${number}; corrija manualmente antes de reconstruir.` });
      }
      const expected = expectedByNumber.get(number);
      if (!expected) throw new TRPCError({ code: 'BAD_REQUEST', message: `Parcela protegida ${number} fora da grade do empréstimo.` });
      protectedNumbers.add(number);
      await db.execute(drizzleSql`UPDATE loanInstallments SET dueDate=${expected.dueDate} WHERE id=${row.id}`);
    }

    // Remove qualquer parcela não protegida, inclusive duplicatas já marcadas como atrasadas.
    await db.execute(drizzleSql`
      DELETE FROM loanInstallments
      WHERE loanId=${input.loanId} AND status NOT IN ('pago', 'em_analise')
    `);
    for (const expected of schedule) {
      if (protectedNumbers.has(expected.installmentNumber)) continue;
      await db.execute(drizzleSql`
        INSERT INTO loanInstallments (loanId, installmentNumber, dueDate, amount)
        VALUES (${input.loanId}, ${expected.installmentNumber}, ${expected.dueDate}, ${expected.amount})
      `);
    }
    const finalDueDate = schedule[schedule.length - 1]?.dueDate;
    await db.execute(drizzleSql`UPDATE loans SET dueDate=${finalDueDate} WHERE id=${input.loanId}`);
    return { ok: true, loanId: input.loanId, protectedInstallments: [...protectedNumbers], dueDate: finalDueDate };
  }),

  // Reagenda parcelas pendentes de um empréstimo diário para novo regime (seg_sab ou seg_dom)
  rescheduleInstallments: adminProcedure.input(z.object({
    loanId: z.number(),
    newWorkDays: z.enum(["seg_sab", "seg_dom"]),
    startFromToday: z.boolean().optional().default(true),
  })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    // Buscar o empréstimo
    const loanRows = await qRows(db, drizzleSql`SELECT * FROM loans WHERE id=${input.loanId} LIMIT 1`);
    if (!loanRows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado' });
    const loan = loanRows[0];
    if (loan.paymentType !== 'diario') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reagendamento disponível apenas para empréstimos diários' });
    // Buscar parcelas pendentes (não pagas)
    const pendingRows = await qRows(db, drizzleSql`
      SELECT * FROM loanInstallments
      WHERE loanId=${input.loanId} AND status IN ('pendente','atrasado')
      ORDER BY installmentNumber ASC
    `);
    if (!pendingRows.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há parcelas pendentes para reagendar' });
    // Buscar última parcela paga para usar como base de data
    const lastPaidRows = await qRows(db, drizzleSql`
      SELECT dueDate FROM loanInstallments
      WHERE loanId=${input.loanId} AND status='pago'
      ORDER BY installmentNumber DESC LIMIT 1
    `);
    // Data base: hoje ou data da última parcela paga (o que for mais recente)
    const todayStr = getBrazilToday();
    let baseDate = todayStr;
    if (lastPaidRows.length) {
      const lastPaidDate = lastPaidRows[0].dueDate as string;
      baseDate = lastPaidDate > todayStr ? lastPaidDate : todayStr;
    }
    // Reagendar parcelas pendentes a partir da data base
    let currentDate = baseDate;
    const updates: { id: number; dueDate: string }[] = [];
    for (const inst of pendingRows) {
      currentDate = nextWorkDay(currentDate, input.newWorkDays);
      updates.push({ id: inst.id as number, dueDate: currentDate });
    }
    // Aplicar atualizações
    for (const upd of updates) {
      await db.execute(drizzleSql`UPDATE loanInstallments SET dueDate=${upd.dueDate} WHERE id=${upd.id}`);
    }
    // Atualizar workDays no empréstimo
    await db.execute(drizzleSql`UPDATE loans SET workDays=${input.newWorkDays}, dueDate=${updates[updates.length - 1].dueDate} WHERE id=${input.loanId}`);
    return {
      ok: true,
      rescheduled: updates.length,
      newWorkDays: input.newWorkDays,
      preview: updates.slice(0, 5),
    };
  }),

  // ââ€â‚¬ââ€â‚¬ SYNC: Sincronizar clientes de empréstimo com senhas ativas do Gastos ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  syncFromGastos: adminProcedure.mutation(async () => {
    const db = await getDb() as any;

    // Contar total antes
    const beforeRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanClients`);
    const before = Number(beforeRows[0]?.cnt || 0);

    // Inserir todos os clientes do Gastos que ainda não existem no Empréstimos
    // Usa REGEXP_REPLACE para normalizar telefone e CPF antes de comparar
    await db.execute(drizzleSql`
      INSERT INTO loanClients (name, cpf, phone, status, profileSlug, creditLimit, interestRate, loanEnabled, allowedPaymentTypes, userId)
      SELECT 
        c.name,
        REGEXP_REPLACE(c.cpf, '[^0-9]', '') as cpf,
        RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 11) as phone,
        'ativo', 'bronze', 0.00, 40.00, 0, 'mensal', 1
      FROM spreadsheetClients sc
      JOIN customers c ON c.deletedAt IS NULL AND (
        RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE(sc.phone, '[^0-9]', ''), 9)
        OR (c.cpf IS NOT NULL AND c.cpf != '' AND sc.cpf IS NOT NULL AND sc.cpf != '' AND REGEXP_REPLACE(c.cpf, '[^0-9]', '') = REGEXP_REPLACE(sc.cpf, '[^0-9]', ''))
      )
      WHERE c.email IS NOT NULL AND c.email != ''
        AND c.cpf IS NOT NULL AND REGEXP_REPLACE(c.cpf, '[^0-9]', '') REGEXP '^[0-9]{11}$'
        AND c.profilePhotoUrl IS NOT NULL AND c.profilePhotoUrl != ''
        AND NOT EXISTS (
          SELECT 1 FROM loanClients lc
          WHERE (c.phone IS NOT NULL AND c.phone != '' AND RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 11) = lc.phone)
             OR (c.cpf IS NOT NULL AND c.cpf != '' AND REGEXP_REPLACE(c.cpf, '[^0-9]', '') = lc.cpf)
        )
    `);

    // Contar total depois
    const afterRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanClients`);
    const after = Number(afterRows[0]?.cnt || 0);
    const created = after - before;

    // Total de clientes do Gastos
    const gastosRows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM spreadsheetClients`);
    const total = Number(gastosRows[0]?.cnt || 0);
    const updated = total - created;

    return { ok: true, created, updated, total };
  }),

  // Aplica taxas de atraso automaticamente em todas as parcelas vencidas não pagas
  // Deve ser chamado diariamente (ex: via cron ou na abertura do painel ADM)
  autoApplyLateFees: adminProcedure.mutation(async () => {
    const db = await getDb() as any;
    const today = getBrazilToday();
    // Buscar config de taxa
    const cfgRows = await qRows(db, drizzleSql`SELECT * FROM loan_late_fee_config WHERE id=1 LIMIT 1`);
    const cfg = cfgRows[0];
    if (!cfg || !cfg.enabled) return { ok: true, applied: 0, message: 'Taxa desativada' };
    // Buscar parcelas vencidas, pendentes, sem taxa já aplicada hoje
    const overdueInsts = await qRows(db, drizzleSql`
      SELECT li.*, lc.late_fee_disabled, lc.id as clientId
      FROM loanInstallments li
      JOIN loans l ON l.id = li.loanId
      JOIN loanClients lc ON lc.id = l.clientId
      WHERE li.status IN ('pendente', 'atrasado')
      AND li.dueDate < ${today}
      AND li.originalAmount IS NULL
      AND l.status NOT IN ('pago', 'cancelado', 'reprovado')
      AND (lc.late_fee_disabled IS NULL OR lc.late_fee_disabled = 0)
    `);
    let applied = 0;
    for (const inst of overdueInsts) {
      const originalAmount = parseFloat(inst.amount);
      const fee = calculateLateFeeForInstallment({
        dueDate: inst.dueDate,
        amount: originalAmount,
        config: cfg,
        clock: { today, hour: 0 },
      });
      if (fee <= 0) continue;
      const newAmount = Math.round((originalAmount + fee) * 100) / 100;
      const note = `Taxa de atraso automática: +R$ ${fee.toFixed(2).replace('.', ',')} aplicada em ${new Date().toLocaleDateString('pt-BR')}`;
      await db.execute(drizzleSql`
        UPDATE loanInstallments
        SET amount=${newAmount.toFixed(2)}, originalAmount=${originalAmount.toFixed(2)},
            feeApplied=${fee.toFixed(2)}, notes=${note}, status='atrasado'
        WHERE id=${inst.id}
      `);
      applied++;
    }
    return { ok: true, applied };
  }),

  // Busca clientes com score D para alerta no ADM
  getScoreDAlerts: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const today = getBrazilToday();
    // Buscar clientes ativos com 6+ parcelas atrasadas
    const alerts = await qRows(db, drizzleSql`
      SELECT lc.id, lc.name, lc.phone,
        COUNT(*) as lateCount
      FROM loanClients lc
      JOIN loans l ON l.clientId = lc.id AND l.status NOT IN ('pago','cancelado','reprovado')
      JOIN loanInstallments li ON li.loanId = l.id
      WHERE lc.status NOT IN ('bloqueado', 'inativo')
      AND li.status IN ('pendente','atrasado')
      AND li.dueDate < ${today}
      GROUP BY lc.id, lc.name, lc.phone
      HAVING lateCount >= 1
      ORDER BY lateCount DESC
      LIMIT 20
    `);
    return alerts.map((a: any) => ({
      clientId: a.id,
      name: a.name,
      phone: a.phone,
      lateCount: parseInt(a.lateCount),
    }));
  }),

  getProofDashboardStats: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const thisMonth = getBrazilToday().slice(0, 7);
    const withProof = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM installmentProofs WHERE hasProof=1`);
    const withoutProof = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM installmentProofs WHERE hasProof=0`);
    const thisMonthProofs = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM installmentProofs WHERE hasProof=1 AND DATE_FORMAT(createdAt,'%Y-%m')=${thisMonth}`);
    const awaitingReview = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments WHERE status='em_analise'`);
    return {
      withProof: parseInt(withProof[0]?.cnt || 0),
      withoutProof: parseInt(withoutProof[0]?.cnt || 0),
      thisMonthProofs: parseInt(thisMonthProofs[0]?.cnt || 0),
      awaitingReview: parseInt(awaitingReview[0]?.cnt || 0),
    };
  }),
});
