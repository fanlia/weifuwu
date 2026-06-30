#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export TEST_S3_SKIP=true
export TEST_DATABASE_URL=
export DATABASE_URL=
export REDIS_URL=

echo "=== Running quick unit tests (no external services) ==="
echo ""

node --test --test-force-exit --test-timeout=30000 \
  test/serve.test.ts test/serve-lifecycle.test.ts \
  test/router.test.ts test/cors.test.ts test/csrf.test.ts \
  test/flash.test.ts test/helmet.test.ts test/compress.test.ts \
  test/cookie.test.ts test/request-id.test.ts test/sse.test.ts \
  test/validate.test.ts test/upload.test.ts test/env.test.ts \
  test/graphql.test.ts test/hub.test.ts test/logger.test.ts \
  test/mailer.test.ts test/middleware-meta.test.ts test/health.test.ts \
  test/rate-limit.test.ts test/trace.test.ts test/ai.test.ts \
  test/static.test.ts test/postgres.test.ts test/redis.test.ts \
  test/queue.test.ts test/theme.test.ts test/i18n.test.ts

