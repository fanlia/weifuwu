import type { ZodSchema } from 'zod'
import type { Middleware } from './types.ts'

// Augment Context with parsed property (shared with upload)
declare module './types.ts' {
  interface Context {
    parsed: Record<string, unknown>
  }
}

export interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
  headers?: ZodSchema
}

/**
 * Parse application/x-www-form-urlencoded body string into Record<string, string>.
 * Duplicate keys become comma-joined string (most common HTML form behavior).
 */
function parseFormBody(text: string): Record<string, string> {
  const params = new URLSearchParams(text)
  const result: Record<string, string> = {}
  for (const [key, value] of params) {
    // Collapse duplicates: last value wins (matches standard server behavior)
    result[key] = value
  }
  return result
}

// Parse body text based on content-type. Returns parsed value or raw string.
// Rules:
// - application/x-www-form-urlencoded => Record<string, string> via URLSearchParams
// - application/json, text/*, vendor+json, or any non-form/non-multipart => try JSON.parse
// - multipart/form-data => raw string (handled by upload())
// - fallback => raw string
function parseBody(text: string, ct: string): unknown {
  if (ct.includes('application/x-www-form-urlencoded')) {
    return parseFormBody(text)
  }

  // Try JSON parse when:
  // - Content-Type explicitly indicates JSON (application/json, *+json)
  // - Content-Type is text/*
  // - Content-Type is not multipart and not urlencoded (catch-all for API types)
  const isExplicitJson = ct.includes('application/json') || ct.includes('+json') || ct.includes('text/') || ct.includes('*/json')
  const isNotSpecialMultipart = !ct.includes('multipart/form-data') && !ct.includes('application/x-www-form-urlencoded')

  if (isExplicitJson || isNotSpecialMultipart) {
    try {
      return JSON.parse(text)
    } catch {
      // keep raw string
    }
  }

  return text
}

export function validate(schemas?: ValidationSchemas): Middleware {
  return async (req, ctx, next) => {
    const parsed: Record<string, unknown> = {}
    const issues: { path: string[]; message: string }[] = []

    if (schemas?.params) {
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

    if (schemas?.query) {
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

    if (schemas?.headers) {
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

    // Always attempt body parsing for non-GET/HEAD methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const ct = req.headers.get('content-type') ?? ''
      const isForm = ct.includes('application/x-www-form-urlencoded')

      // Parse body if: schema asks for it, OR it's a form (no schema needed)
      if (schemas?.body || isForm) {
        if (req.body === null) {
          if (schemas?.body) {
            issues.push({ path: ['body'], message: 'Request body is required' })
          }
        } else {
          const bodyText = await req.text()
          if (!bodyText) {
            if (schemas?.body) {
              issues.push({ path: ['body'], message: 'Request body is required' })
            }
          } else {
            const bodyValue = parseBody(bodyText, ct)
            if (schemas?.body) {
              const result = schemas.body.safeParse(bodyValue)
              if (result.success) {
                parsed.body = result.data
              } else {
                issues.push(...result.error.issues.map((i) => ({
                  path: ['body', ...i.path.map(String)],
                  message: i.message,
                })))
              }
            } else {
              // No schema: still populate ctx.parsed.body with parsed value
              // (for form-urlencoded, this is a Record<string, string>)
              parsed.body = bodyValue as Record<string, string>
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      return Response.json({ error: 'Validation failed', issues }, { status: 400 })
    }

    ctx.parsed = { ...ctx.parsed, ...parsed }
    return next(req, ctx)
  }
}
