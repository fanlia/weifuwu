import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Context } from '../types.ts'
import type { OAuth2Client } from './types.ts'
import type { BoundTable } from '../postgres/schema/index.ts'

interface OAuth2Deps {
  pg: any
  users: BoundTable<any>
  jwtSecret: string
  expiresIn: string | number
}

export function createOAuth2Server(deps: OAuth2Deps) {
  const { pg, users, jwtSecret, expiresIn } = deps

  async function getClient(clientId: string): Promise<OAuth2Client | null> {
    const [row] = await pg.sql`
      SELECT * FROM "_oauth2_clients" WHERE "client_id" = ${clientId} LIMIT 1
    `
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      redirectUris: row.redirect_uris,
      scopes: row.scopes,
    }
  }

  async function registerClient(data: { name: string; redirectUris: string[] }): Promise<OAuth2Client> {
    const clientId = crypto.randomUUID()
    const clientSecret = crypto.randomBytes(32).toString('hex')
    const [row] = await pg.sql`
      INSERT INTO "_oauth2_clients" ("name", "client_id", "client_secret", "redirect_uris")
      VALUES (${data.name}, ${clientId}, ${clientSecret}, ${pg.sql.array(data.redirectUris)})
      RETURNING *
    `
    return {
      id: row.id,
      name: row.name,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      redirectUris: row.redirect_uris,
      scopes: row.scopes,
    }
  }

  async function revokeClient(clientId: string): Promise<void> {
    await pg.sql`
      DELETE FROM "_oauth2_clients" WHERE "client_id" = ${clientId}
    `
  }

  function extractUser(req: Request): { id: number; email: string; role: string } | null {
    const header = req.headers.get('Authorization')
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), jwtSecret) as any
        return { id: payload.sub, email: payload.email, role: payload.role }
      } catch {
        return null
      }
    }

    const url = new URL(req.url)
    const qsToken = url.searchParams.get('access_token')
    if (qsToken) {
      try {
        const payload = jwt.verify(qsToken, jwtSecret) as any
        return { id: payload.sub, email: payload.email, role: payload.role }
      } catch {
        return null
      }
    }

    const cookie = req.headers.get('cookie')
    if (cookie) {
      const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('session='))
      if (match) {
        try {
          const payload = jwt.verify(match.slice(8), jwtSecret) as any
          return { id: payload.sub, email: payload.email, role: payload.role }
        } catch {
          return null
        }
      }
    }

    return null
  }

  function consentPage(client: OAuth2Client, params: Record<string, string>): Response {
    const fields = Object.entries(params).map(([k, v]) =>
      `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`
    ).join('\n      ')

    return new Response(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Authorize</title>
<style>
  body { font-family: sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 32px; }
  h2 { margin-top: 0; }
  .client { color: #555; margin-bottom: 24px; }
  .btn-group { display: flex; gap: 12px; }
  .btn { padding: 10px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .btn-approve { background: #2563eb; color: #fff; }
  .btn-deny { background: #e5e7eb; color: #374151; }
</style>
</head>
<body>
  <div class="card">
    <h2>Authorize</h2>
    <p class="client">Application <strong>${client.name}</strong> requests access to your account.</p>
    <form method="POST" action="/oauth/consent">
      ${fields}
      <div class="btn-group">
        <button type="submit" name="approve" value="true" class="btn btn-approve">Approve</button>
        <button type="submit" name="approve" value="false" class="btn btn-deny">Deny</button>
      </div>
    </form>
  </div>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  function errorPage(error: string, description?: string): Response {
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 20px}
h2{color:#dc2626}.desc{color:#555}</style>
</head>
<body><h2>${error}</h2>${description ? `<p class="desc">${description}</p>` : ''}</body>
</html>`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  async function authorizeHandler(req: Request, _ctx: Context): Promise<Response> {
    const url = new URL(req.url)
    const clientId = url.searchParams.get('client_id') || ''
    const redirectUri = url.searchParams.get('redirect_uri') || ''
    const responseType = url.searchParams.get('response_type') || ''
    const scope = url.searchParams.get('scope') || ''
    const state = url.searchParams.get('state') || ''
    const codeChallenge = url.searchParams.get('code_challenge') || ''
    const codeChallengeMethod = url.searchParams.get('code_challenge_method') || ''

    if (responseType !== 'code') {
      return errorPage('Invalid response_type', 'Only authorization_code grant is supported.')
    }

    const client = await getClient(clientId)
    if (!client) {
      return errorPage('Invalid client_id', 'No client found with the given client_id.')
    }

    if (!client.redirectUris.includes(redirectUri)) {
      return errorPage('Invalid redirect_uri', 'The redirect_uri is not registered for this client.')
    }

    const user = extractUser(req)
    if (!user) {
      const loginUrl = `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`
      return new Response(null, { status: 302, headers: { location: loginUrl } })
    }

    const params: Record<string, string> = {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      user_id: String(user.id),
    }
    if (codeChallenge) {
      params.code_challenge = codeChallenge
      params.code_challenge_method = codeChallengeMethod
    }

    return consentPage(client, params)
  }

  async function consentHandler(req: Request): Promise<Response> {
    const form = await req.formData()
    const approve = form.get('approve') === 'true'
    const clientId = (form.get('client_id') as string) || ''
    const redirectUri = (form.get('redirect_uri') as string) || ''
    const scope = (form.get('scope') as string) || ''
    const state = (form.get('state') as string) || ''
    const userId = parseInt((form.get('user_id') as string) || '0', 10)
    const codeChallenge = (form.get('code_challenge') as string) || ''
    const codeChallengeMethod = (form.get('code_challenge_method') as string) || ''

    if (!approve) {
      const loc = `${redirectUri}?error=access_denied${state ? `&state=${state}` : ''}`
      return Response.redirect(loc, 302)
    }

    const code = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await pg.sql`
      INSERT INTO "_oauth2_codes" ("code", "client_id", "user_id", "redirect_uri", "code_challenge", "code_challenge_method", "scope", "expires_at")
      VALUES (${code}, ${clientId}, ${userId}, ${redirectUri}, ${codeChallenge || null}, ${codeChallengeMethod || null}, ${scope || null}, ${expiresAt})
    `

    const loc = `${redirectUri}?code=${code}${state ? `&state=${state}` : ''}`
    return Response.redirect(loc, 302)
  }

  async function tokenHandler(req: Request): Promise<Response> {
    const body: Record<string, string> = {}
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await req.json() as Record<string, string>
      Object.assign(body, json)
    } else {
      const form = await req.formData()
      for (const [k, v] of form) {
        body[k] = String(v)
      }
    }

    const grantType = body.grant_type || ''

    if (grantType === 'authorization_code') {
      return handleAuthCode(body)
    }

    if (grantType === 'client_credentials') {
      return handleClientCredentials(body)
    }

    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }

  async function handleAuthCode(body: Record<string, string>): Promise<Response> {
    const code = body.code || ''
    const clientId = body.client_id || ''
    const clientSecret = body.client_secret || ''
    const redirectUri = body.redirect_uri || ''
    const codeVerifier = body.code_verifier || ''

    const client = await getClient(clientId)
    if (!client) {
      return Response.json({ error: 'invalid_client' }, { status: 401 })
    }

    if (client.clientSecret !== clientSecret) {
      return Response.json({ error: 'invalid_client' }, { status: 401 })
    }

    const [stored] = await pg.sql`
      SELECT * FROM "_oauth2_codes"
      WHERE "code" = ${code} AND "client_id" = ${clientId} AND "used" = FALSE
      LIMIT 1
    `
    if (!stored) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }

    if (new Date(stored.expires_at) < new Date()) {
      return Response.json({ error: 'invalid_grant', error_description: 'Code expired' }, { status: 400 })
    }

    if (stored.redirect_uri !== redirectUri) {
      return Response.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400 })
    }

    if (stored.code_challenge) {
      if (!codeVerifier) {
        return Response.json({ error: 'invalid_grant', error_description: 'code_verifier required' }, { status: 400 })
      }
      let expected: string
      if (stored.code_challenge_method === 'plain') {
        expected = codeVerifier
      } else {
        expected = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url')
      }
      if (expected !== stored.code_challenge) {
        return Response.json({ error: 'invalid_grant', error_description: 'code_verifier mismatch' }, { status: 400 })
      }
    }

    await pg.sql`UPDATE "_oauth2_codes" SET "used" = TRUE WHERE "id" = ${stored.id}`

    const user = await users.findById(stored.user_id)
    if (!user) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }

    const scope = stored.scope || ''
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, client_id: clientId, scope },
      jwtSecret,
      { expiresIn } as any,
    )

    const refreshToken = crypto.randomUUID()
    const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await pg.sql`
      INSERT INTO "_oauth2_tokens" ("token", "client_id", "user_id", "scope", "expires_at")
      VALUES (${refreshToken}, ${clientId}, ${user.id}, ${scope || null}, ${refreshExpires})
    `

    return Response.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: scope || undefined,
    })
  }

  async function handleClientCredentials(body: Record<string, string>): Promise<Response> {
    const clientId = body.client_id || ''
    const clientSecret = body.client_secret || ''
    const scope = body.scope || ''

    const client = await getClient(clientId)
    if (!client || client.clientSecret !== clientSecret) {
      return Response.json({ error: 'invalid_client' }, { status: 401 })
    }

    const accessToken = jwt.sign(
      { sub: clientId, client_id: clientId, scope, token_type: 'client_credentials' },
      jwtSecret,
      { expiresIn } as any,
    )

    return Response.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: scope || undefined,
    })
  }

  return { authorizeHandler, consentHandler, tokenHandler, registerClient, getClient, revokeClient }
}
