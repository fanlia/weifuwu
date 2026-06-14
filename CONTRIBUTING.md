# Contributing to weifuwu

## Development Setup

```bash
git clone <repo>
cd weifuwu
npm install
```

### Running tests

```bash
# All tests
npm test

# Single file
node --test test/router.test.ts

# With coverage
npm run test:coverage
```

### Code quality checks

```bash
# TypeScript type check
npm run typecheck

# Lint
npm run lint

# Format check
npm run format:check

# Auto-format
npm run format
```

These checks run automatically via `husky` on every commit.

## Project Structure

```
weifuwu/
  *.ts              # Core modules (router, serve, cookie, etc.)
  postgres/         # PostgreSQL integration
  redis/            # Redis integration
  queue/            # Job queue (memory/PG/Redis)
  user/             # Authentication & user management
  tenant/           # Multi-tenant support
  agent/            # AI agent module
  messager/         # Real-time messaging
  opencode/         # AI coding assistant
  iii/              # Image analysis
  kb/               # Knowledge base
  deploy/           # Deployment & process management
  test/             # Test files
```

## Module Patterns

| Pattern         | Description                        | Example                             |
| --------------- | ---------------------------------- | ----------------------------------- |
| α - Middleware  | `app.use(mod())`                   | `compress()`, `csrf()`, `session()` |
| β - Router      | `app.use('/path', mod())`          | `health()`, `graphql()`, `user()`   |
| γ - Standalone  | `mod()` direct call                | `mailer()`, `fts`                   |
| δ - Client-side | Import hook from `'weifuwu/react'` | `useTheme()`, `useLocale()`         |

## Code Conventions

- All imports use explicit `.ts` extensions (`import { x } from './foo.ts'`)
- Node.js v24+ native TypeScript (no tsc compiler needed for runtime)
- Handler signature: `(req: Request, ctx: Context) => Response | Promise<Response>`
- Middleware signature: `(req: Request, ctx: Context, next) => Response | Promise<Response>`
- Every middleware adds exactly ONE namespaced field on `ctx`
- All stateful modules cleanup via `.close(): Promise<void>`
- Modules with ctx injection must have `declare module './types.ts'` in the module file

## Pull Request Guidelines

1. Keep changes focused — one feature/fix per PR
2. Add tests for new functionality
3. Run `npm run typecheck && npm run lint && npm test` before pushing
4. Update AGENTS.md if adding new public API
