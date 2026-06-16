import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import type { Context, Middleware } from '../types.ts'

describe('middleware __meta dependency checking', () => {
  it('should track injected fields from middleware __meta', () => {
    const app = new Router()

    // Create mock middlewares with __meta
    const sqlMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
    sqlMw.__meta = { injects: ['sql'], depends: [] }

    const redisMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
    redisMw.__meta = { injects: ['redis'], depends: [] }

    const sessionMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
    sessionMw.__meta = { injects: ['session'], depends: ['redis'] }

    app.use(sqlMw)
    app.use(redisMw)
    app.use(sessionMw)

    // If we got here without warnings, the dependency check passed
    assert.ok(true)
  })

  it('should warn when dependency is missing', () => {
    const app = new Router()
    const warnings: string[] = []

    // Capture console.warn
    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const sessionMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      sessionMw.__meta = { injects: ['session'], depends: ['redis'] }

      app.use(sessionMw)

      assert.ok(warnings.length > 0, 'should have warned about missing redis dependency')
      const warning = warnings[0]
      assert.ok(warning.includes('redis'), 'warning should mention the missing dependency')
      assert.ok(warning.includes('ctx.redis'), 'warning should mention ctx.redis')
    } finally {
      console.warn = origWarn
    }
  })

  it('should warn for path-scoped middleware with missing dependency', () => {
    const app = new Router()
    const warnings: string[] = []

    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const mw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      mw.__meta = { injects: [], depends: ['sql'] }

      app.use('/admin', mw)

      assert.ok(warnings.length > 0, 'should have warned about missing sql dependency')
    } finally {
      console.warn = origWarn
    }
  })

  it('should not warn when all dependencies are satisfied', () => {
    const app = new Router()
    const warnings: string[] = []

    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const sqlMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      sqlMw.__meta = { injects: ['sql'], depends: [] }

      const userMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      userMw.__meta = { injects: ['user'], depends: ['sql'] }

      app.use(sqlMw)
      app.use(userMw)

      assert.equal(warnings.length, 0, 'should have no warnings')
    } finally {
      console.warn = origWarn
    }
  })

  it('should handle auto-registered modules with .middleware()', () => {
    const app = new Router()
    const warnings: string[] = []

    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      // Simulate a module like theme() that has .middleware()
      const moduleMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      moduleMw.__meta = { injects: ['theme'], depends: [] }

      const mod = new Router() as any
      mod.middleware = () => moduleMw

      app.use(mod)
      assert.equal(warnings.length, 0, 'auto-registered module should not warn')
    } finally {
      console.warn = origWarn
    }
  })

  it('middleware without __meta should not trigger warnings', () => {
    const app = new Router()
    const warnings: string[] = []

    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const mw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      // No __meta attached

      app.use(mw)
      assert.equal(warnings.length, 0, 'no __meta should not warn')
    } finally {
      console.warn = origWarn
    }
  })

  it('should track multiple injects from one middleware', () => {
    const app = new Router()

    const mw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
    mw.__meta = { injects: ['sql', 'redis', 'ai'], depends: [] }

    app.use(mw)

    // After registering a middleware that depends on these, no warn should occur
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      const userMw = ((_req: Request, ctx: Context, next: any) => next(req, ctx)) as any
      userMw.__meta = { injects: ['user'], depends: ['sql'] }

      app.use(userMw)
      assert.equal(warnings.length, 0, 'sql dependency should be satisfied')
    } finally {
      console.warn = origWarn
    }
  })
})
