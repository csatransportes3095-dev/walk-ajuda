#!/bin/sh
set -eu

echo "Verificando migrações pendentes..."
pnpm run db:migrate:online-support

echo "Iniciando servidor..."
exec node dist/index.js
