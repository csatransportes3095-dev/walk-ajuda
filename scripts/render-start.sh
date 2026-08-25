#!/bin/sh
set -eu

echo "Verificando migrações pendentes..."
pnpm run db:migrate:question-audio
pnpm run db:migrate:private-authenticator-qr
pnpm run db:migrate:admin-authenticator-vault
pnpm run db:migrate:admin-authenticator-order-links
pnpm run db:migrate:option-card-appearance
pnpm run db:migrate:locadora
pnpm run db:migrate:spreadsheet-referral-declaration
pnpm run db:migrate:referral-commission-attribution
pnpm run db:migrate:online-support
pnpm run db:migrate:cartoes
pnpm run db:migrate:loans-compat
pnpm run db:migrate:system-backups
pnpm exec tsx scripts/apply-loans-recovery-preflight.ts
pnpm exec tsx scripts/apply-loans-recovery-wrapper.ts
pnpm exec tsx scripts/apply-loans-recovery-20260822-fix.ts

echo "Iniciando servidor..."
exec node dist/index.js
