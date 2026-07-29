#!/bin/sh
set -eu

echo "Verificando migrações pendentes..."
pnpm run db:migrate:prod

echo "Iniciando servidor..."
exec node dist/index.js
