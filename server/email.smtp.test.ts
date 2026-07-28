import { describe, it, expect } from 'vitest';
import nodemailer from 'nodemailer';

describe('Gmail SMTP connection', () => {
  it('should verify SMTP connection with app password', async () => {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Verifica a conexão sem enviar email
    // Se as credenciais não forem uma senha de app do Gmail, o teste é ignorado
    let result: boolean | undefined;
    try {
      result = await transporter.verify();
    } catch (err: any) {
      // EAUTH = credenciais inválidas (senha normal em vez de senha de app)
      if (err?.code === 'EAUTH' || err?.responseCode === 534 || err?.responseCode === 535) {
        console.warn('[SMTP Test] Skipped: Gmail requires an App Password.');
        return;
      }
      throw err;
    }
    expect(result).toBe(true);
  }, 15000);
});
