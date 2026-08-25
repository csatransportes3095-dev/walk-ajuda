/**
 * Restaurador legado desativado por segurança.
 *
 * Este arquivo anteriormente executava um SQL diretamente em DATABASE_URL.
 * A restauração deve usar exclusivamente:
 *
 *   pnpm run restore:isolated -- <backup.wajuda.enc> --output <pasta> [--dry-run]
 *
 * O comando completo exige RESTORE_MODE=isolated, RESTORE_CONFIRM,
 * RESTORE_TARGET_LABEL não produtivo, RESTORE_DATABASE_URL separado e
 * credenciais R2 de teste separadas.
 */
throw new Error(
  "Restaurador financeiro legado desativado: use restore:isolated em destino não produtivo.",
);
