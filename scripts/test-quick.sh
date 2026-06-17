#!/usr/bin/env bash
# Run unit tests that don't require external services (PostgreSQL, Redis, MinIO).
# This is faster than the full test suite and suitable for quick feedback during development.
set -euo pipefail

cd "$(dirname "$0")/.."

export TEST_S3_SKIP=true
export TEST_DATABASE_URL=
export DATABASE_URL=
export REDIS_URL=

echo "=== Running quick unit tests (no external services) ==="
echo ""

node --test --test-force-exit --test-timeout=30000 \
  'test/serve.test.ts' \
  'test/serve-lifecycle.test.ts' \
  'test/router.test.ts' \
  'test/cors.test.ts' \
  'test/csrf.test.ts' \
  'test/flash.test.ts' \
  'test/helmet.test.ts' \
  'test/compress.test.ts' \
  'test/cookie.test.ts' \
  'test/i18n.test.ts' \
  'test/request-id.test.ts' \
  'test/sse.test.ts' \
  'test/theme.test.ts' \
  'test/validate.test.ts' \
  'test/upload.test.ts' \
  'test/analytics.test.ts' \
  'test/cache.test.ts' \
  'test/error-boundary.test.ts' \
  'test/env.test.ts' \
  'test/fts.test.ts' \
  'test/graphql.test.ts' \
  'test/hub.test.ts' \
  'test/logger.test.ts' \
  'test/mailer.test.ts' \
  'test/mcp.test.ts' \
  'test/middleware-meta.test.ts' \
  'test/module-server.test.ts' \
  'test/not-found.test.ts' \
  'test/permissions.test.ts' \
  'test/s3.test.ts' \
  'test/seo.test.ts' \
  'test/webhook.test.ts' \
  'test/health.test.ts' \
  'test/rate-limit.test.ts' \
  'test/head.test.ts' \
  'test/client-theme.test.ts' \
  'test/client-locale.test.ts' \
  'test/use-action.test.ts' \
  'test/use-flash-message.test.ts' \
  'test/use-websocket.test.ts' \
  'test/trace.test.ts' \
  'test/cron-utils.test.ts' \
  'test/ai.test.ts' \
  'test/ai-sdk.test.ts' \
  'test/static.test.ts' \
  'test/happy-setup.test.ts' \
  'test/compile.test.ts' \
  'test/client-state.test.ts' \
  'test/client-router.test.ts' \
  'test/tsx-context.test.ts' \
  'test/html-shell.test.ts' \
  'test/layout.test.ts' \
  'test/live.test.ts' \
  'test/ssr.test.ts' \
  'test/ssr-entries.test.ts' \
  'test/stream.test.ts' \
  'test/tailwind.test.ts' \
  'test/use-agent-stream.test.ts' \
  'test/react.test.ts' \
  'test/skills.test.ts' \
  'test/run-workflow.test.ts' \
  'test/api-keys.test.ts' \
  'test/schema.test.ts' \
  'test/where.test.ts' \
  'test/vendor.test.ts' \
  'test/ws-test-utils.test.ts' \
  'test/test-utils.test.ts' \
  'test/tenant.test.ts' \
  'test/tenant-schema.test.ts' \
  'test/deploy.test.ts' \
  'test/auth.test.ts' \
  'test/cli.test.ts' \
  'test/cli.template.test.ts'
