#!/bin/sh
set -e

npx prisma db push

exec node dist/app/src/index.js
