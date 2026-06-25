#!/bin/bash
set -e

echo "🦈 Loto-Shark API — iniciando build..."
cd /home/runner/workspace
pnpm --filter @workspace/api-server run build

echo "🚀 Iniciando servidor na porta ${PORT:-8080}..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
