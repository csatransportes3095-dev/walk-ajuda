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
pnpm exec tsx scripts/apply-loans-recovery-preflight.ts
pnpm exec tsx scripts/apply-loans-recovery-wrapper.ts

echo "Iniciando servidor..."
exec node dist/index.js
