#!/bin/bash
set -e
pnpm install --frozen-lockfile
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push
