import { describe, it, expect } from 'vitest';
import nodemailer from 'nodemailer';

describe('Email configuration', () => {
  it('should have EMAIL_USER set to h2@h2colombiano.com', () => {
    expect(process.env.EMAIL_USER).toBe('h2@h2colombiano.com');
  });

  it('should have EMAIL_PASSWORD configured', () => {
    expect(process.env.EMAIL_PASSWORD).toBeTruthy();
    expect(process.env.EMAIL_PASSWORD?.length).toBeGreaterThan(0);
  });

  it('should create a valid nodemailer transporter', () => {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
    expect(transporter).toBeDefined();
  });
});
