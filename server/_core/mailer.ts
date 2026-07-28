import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.zoho.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "walkajuda@walkajuda.com";
const SMTP_PASS = process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return cachedTransport;
}

export async function sendMail(options: Mail.Options) {
  const transporter = getTransport();
  return transporter.sendMail({
    from: SMTP_FROM,
    ...options,
  });
}

export async function verifyMailConnection() {
  const transporter = getTransport();
  return transporter.verify();
}

export const smtpConfig = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  user: SMTP_USER,
  pass: SMTP_PASS,
  from: SMTP_FROM,
};
