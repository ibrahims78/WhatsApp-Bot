#!/bin/sh
set -e

echo "============================================"
echo "   WhatsApp Manager - Development Mode"
echo "============================================"

echo ""
echo "[1/3] Running database schema migration..."
cd /app/lib/db
pnpm exec drizzle-kit push --config ./drizzle.config.ts
cd /app
echo "Migration complete."

echo ""
echo "[2/3] Building API server..."
cd /app/artifacts/api-server
pnpm run build
echo "Build complete."

echo ""
echo "[3/3] Starting API server (NODE_ENV=development)..."
exec node --enable-source-maps /app/artifacts/api-server/dist/index.mjs
