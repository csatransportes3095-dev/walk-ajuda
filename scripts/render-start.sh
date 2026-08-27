#!/bin/sh
set -eu

run_boot_step() {
  name="$1"
  shift
  echo "[BOOT-DIAG] START ${name} timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  set +e
  "$@"
  code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    echo "[BOOT-DIAG] OK ${name} code=0 timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    return 0
  fi
  echo "[BOOT-DIAG] FAILED ${name} code=${code} timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  return "$code"
}

echo "Verificando migrações pendentes..."
run_boot_step "db-migrate-question-audio" pnpm run db:migrate:question-audio
run_boot_step "db-migrate-private-authenticator-qr" pnpm run db:migrate:private-authenticator-qr
run_boot_step "db-migrate-admin-authenticator-vault" pnpm run db:migrate:admin-authenticator-vault
run_boot_step "db-migrate-admin-authenticator-order-links" pnpm run db:migrate:admin-authenticator-order-links
run_boot_step "db-migrate-option-card-appearance" pnpm run db:migrate:option-card-appearance
run_boot_step "db-migrate-locadora" pnpm run db:migrate:locadora
run_boot_step "db-migrate-spreadsheet-referral-declaration" pnpm run db:migrate:spreadsheet-referral-declaration
run_boot_step "db-migrate-referral-commission-attribution" pnpm run db:migrate:referral-commission-attribution
run_boot_step "db-migrate-online-support" pnpm run db:migrate:online-support
run_boot_step "db-migrate-cartoes" pnpm run db:migrate:cartoes
run_boot_step "db-migrate-loans-compat" pnpm run db:migrate:loans-compat
run_boot_step "db-migrate-system-backups" pnpm run db:migrate:system-backups
run_boot_step "db-migrate-whatsapp-templates" pnpm run db:migrate:whatsapp-templates
run_boot_step "db-migrate-h2ads" pnpm run db:migrate:h2ads
run_boot_step "db-migrate-h2ads-network" pnpm run db:migrate:h2ads-network
run_boot_step "db-migrate-h2ads-proxy-credentials" pnpm run db:migrate:h2ads-proxy-credentials
run_boot_step "db-migrate-h2ads-browser-workers" pnpm run db:migrate:h2ads-browser-workers
run_boot_step "db-migrate-h2ads-browser-preparation" pnpm run db:migrate:h2ads-browser-preparation
run_boot_step "loans-recovery-preflight" pnpm exec tsx scripts/apply-loans-recovery-preflight.ts
run_boot_step "loans-recovery-wrapper" pnpm exec tsx scripts/apply-loans-recovery-wrapper.ts
run_boot_step "loans-recovery-20260822-fix" pnpm exec tsx scripts/apply-loans-recovery-20260822-fix.ts

echo "[BOOT-DIAG] START server timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Iniciando servidor..."
exec node dist/index.js
