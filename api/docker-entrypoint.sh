#!/bin/sh
set -e

echo "⏳ Waiting for database to be ready..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "   DB not ready, retrying in 2s..."
  sleep 2
done

echo "✅ Database schema applied."
echo "🚀 Starting DealForge API..."
exec node dist/index.js
