#!/usr/bin/env bash
# Run unit tests that don't require external services (PostgreSQL, Redis, MinIO).
# Integration-dependent tests auto-skip when their env vars are unset.
set -euo pipefail

# Explicitly unset service URLs to ensure integration tests skip
unset DATABASE_URL TEST_DATABASE_URL REDIS_URL S3_ENDPOINT

cd "$(dirname "$0")/.."

echo "=== Running unit tests (external services disabled) ==="
echo ""

node --test 'test/**/*.test.ts'
