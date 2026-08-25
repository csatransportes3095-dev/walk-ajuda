import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getAdminJwtSecret } from "../adminJwt";
import {
  getSystemBackup,
  isBackupEncryptionConfigured,
  isGoogleDriveBackupConfigured,
  listSystemBackups,
  startSystemBackup,
  type BackupManifest,
  streamSystemBackupArtifact,
  uploadSystemBackupToGoogleDrive,
} from "../backupService";

export function isAdminBackupRequest(req: Request): boolean {
  try {
    const token = parseCookieHeader(req.headers.cookie || "").admin_token;
    const secret = getAdminJwtSecret();
    if (!token || !secret) return false;
    const payload = jwt.verify(token, secret) as { role?: string };
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export const backupRouter = router({
  list: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(({ input }) => listSystemBackups(input?.limit ?? 20)),

  status: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .query(({ input }) => getSystemBackup(input.id)),

  config: adminProcedure.query(() => ({
    encryptionConfigured: isBackupEncryptionConfigured(),
    driveConfigured: isGoogleDriveBackupConfigured(),
  })),

  sendToDrive: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(({ input }) => uploadSystemBackupToGoogleDrive(input.id)),

  start: adminProcedure.mutation(async () => {
    const result = await startSystemBackup("admin");
    if (!result.accepted) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe um backup em processamento." });
    }
    return result;
  }),
});

export async function getBackupDownload(req: Request, id: string) {
  if (!isAdminBackupRequest(req)) return null;
  if (!/^[a-f0-9]{48}$/i.test(id)) return null;
  return await streamSystemBackupArtifact(id);
}

export function getBackupDownloadName(id: string) {
  return `walk-ajuda-backup-${id}.wajuda.enc`;
}

export type { BackupManifest };
