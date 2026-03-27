#!/bin/sh
set -e

echo "============================================"
echo "   WhatsApp Manager - API Server Starting"
echo "============================================"

echo ""
echo "[1/2] Running database schema migration..."
cd /app
pnpm --filter @workspace/db push
echo "Schema migration complete."

echo ""
echo "[2/2] Starting API server on port $PORT..."
exec node --enable-source-maps /app/artifacts/api-server/dist/index.mjs
