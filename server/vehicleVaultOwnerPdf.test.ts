import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import type { TrpcContext } from './_core/context';
import { makeSyntheticOwnerPdf, syntheticVehicle } from '../scripts/tests/vehicle-vault-owner-fixtures.mjs';

vi.mock('./db', () => ({ getDb: vi.fn(() => { throw new Error('PDF preview must not access a database'); }) }));
vi.mock('./locadora/storage', () => ({
  storeLocadoraPrivateFile: vi.fn(() => { throw new Error('Preview must not upload a file'); }),
  readLocadoraPrivateFile: vi.fn(), deleteLocadoraPrivateFile: vi.fn(),
}));
import { vehicleVaultRouter } from './routers/vehicleVault';

const secret = 'isolated-real-pdf-owner-preview-secret-20261120';
let dir: string;
function admin() {
  return vehicleVaultRouter.createCaller({ user: null,
    req: { headers: { cookie: 'admin_token=' + jwt.sign({ role: 'admin' }, secret) } } as TrpcContext['req'],
    res: {} as TrpcContext['res'] });
}

describe('Vehicle owner — real synthetic PDFs and OCR', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', secret);
    dir = await mkdtemp(join(tmpdir(), 'vehicle-owner-pdf-test-'));
  });
  afterAll(async () => { vi.unstubAllEnvs(); if (dir) await rm(dir, { recursive: true, force: true }); });

  it('extracts an accented owner from a real text PDF through previewPdf', async () => {
    const pdf = await makeSyntheticOwnerPdf({ ownerName: 'ANA SINTÉTICA D\'ÁVILA' });
    const found = await admin().previewPdf({ base64: pdf.toString('base64') });
    expect(found).toMatchObject({ ...syntheticVehicle, ownerName: "ANA SINTÉTICA D'ÁVILA", missing: [] });
  }, 40_000);

  it('recovers an owner found only in pixels without replacing the native vehicle fields', async () => {
    const ownerName = 'PESSOA SINTETICA OCR';
    const pdf = await makeSyntheticOwnerPdf({ ownerName, imageOwner: true });
    const file = join(dir, 'mixed-synthetic-owner.pdf');
    await writeFile(file, pdf);
    const nativeText = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 20_000 });
    expect(nativeText).toContain(syntheticVehicle.plate);
    expect(nativeText).not.toContain(ownerName);
    const nativePreview = await admin().previewText({ text: nativeText });
    expect(nativePreview).toMatchObject({ ...syntheticVehicle, ownerName: '', missing: [] });
    const found = await admin().previewPdf({ base64: pdf.toString('base64') });
    expect(found).toMatchObject({ ...syntheticVehicle, ownerName, missing: [] });
  }, 120_000);

  it('keeps a PDF without an owner usable and returns an empty optional field', async () => {
    const pdf = await makeSyntheticOwnerPdf();
    const found = await admin().previewPdf({ base64: pdf.toString('base64') });
    expect(found).toMatchObject({ ...syntheticVehicle, ownerName: '', missing: [] });
  }, 120_000);

  it('preserves a native owner when OCR is needed for classification and finds a different name', async () => {
    const ownerName = 'ANA SINTÉTICA NATIVA';
    const pdf = await makeSyntheticOwnerPdf({ ownerName, ocrOwnerName: 'OUTRA PESSOA SINTETICA OCR', imageClassification: true });
    const file = join(dir, 'native-owner-extra-ocr.pdf');
    await writeFile(file, pdf);
    const nativeText = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 20_000 });
    const nativePreview = await admin().previewText({ text: nativeText });
    expect(nativePreview).toMatchObject({ ownerName, category: '', exerciseYear: null });
    expect(nativeText).not.toContain('OUTRA PESSOA SINTETICA OCR');
    const found = await admin().previewPdf({ base64: pdf.toString('base64') });
    expect(found).toMatchObject({ ...syntheticVehicle, ownerName, missing: [] });
  }, 120_000);
});
