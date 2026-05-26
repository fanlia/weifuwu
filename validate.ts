import type { ZodSchema } from 'zod'
import type { Middleware } from './types.ts'

export interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
  headers?: ZodSchema
}

export function validate(schemas: ValidationSchemas): Middleware {
  return async (req, ctx, next) => {
    const parsed: Record<string, unknown> = {}
    const issues: { path: string[]; message: string }[] = []

    if (schemas.params) {
      const result = schemas.params.safeParse(ctx.params)
      if (result.success) {
        parsed.params = result.data
      } else {
        issues.push(...result.error.issues.map((i) => ({
          path: ['params', ...i.path.map(String)],
          message: i.message,
        })))
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(ctx.query)
      if (result.success) {
        parsed.query = result.data
      } else {
        issues.push(...result.error.issues.map((i) => ({
          path: ['query', ...i.path.map(String)],
          message: i.message,
        })))
      }
    }

    if (schemas.headers) {
      const rawHeaders: Record<string, string> = {}
      req.headers.forEach((v, k) => { rawHeaders[k] = v })
      const result = schemas.headers.safeParse(rawHeaders)
      if (result.success) {
        parsed.headers = result.data
      } else {
        issues.push(...result.error.issues.map((i) => ({
          path: ['headers', ...i.path.map(String)],
          message: i.message,
        })))
      }
    }

    if (schemas.body) {
      if (req.body === null) {
        issues.push({ path: ['body'], message: 'Request body is required' })
      } else {
        const bodyText = await req.text()
        if (!bodyText && req.method !== 'GET' && req.method !== 'HEAD') {
          issues.push({ path: ['body'], message: 'Request body is required' })
        } else {
          let bodyValue: unknown
          try {
            bodyValue = JSON.parse(bodyText)
          } catch {
            bodyValue = bodyText
          }
          const result = schemas.body.safeParse(bodyValue)
          if (result.success) {
            parsed.body = result.data
          } else {
            issues.push(...result.error.issues.map((i) => ({
              path: ['body', ...i.path.map(String)],
              message: i.message,
            })))
          }
        }
      }
    }

    if (issues.length > 0) {
      return Response.json({ error: 'Validation failed', issues }, { status: 400 })
    }

    ctx.parsed = parsed
    return next(req, ctx)
  }
}
