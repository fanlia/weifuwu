/**
 * auth 后端 API——内存用户表 + 会话（注册函数：独立 server 与 showcase 嵌入共享）
 */
import type { Router } from 'weifuwu'
import { createMemorySql } from 'weifuwu'

export interface AuthUser { id: string; email: string; name: string }

export function registerAuthApi(app: Router, sql: any): void {
  // 内存会话表（token → userId）——演示用；生产换 ctx.auth/userSystem
  const sessions = new Map<string, string>()
  let seq = 0

  app.post('/api/auth/register', async (req: Request) => {
    const { email, password, name } = await req.json()
    if (!String(email ?? '').includes('@')) return Response.json({ ok: false, error: '邮箱格式无效' })
    if (String(password ?? '').length < 6) return Response.json({ ok: false, error: '密码至少 6 位' })
    const rows = await sql`INSERT INTO auth_users (email, password, name) VALUES (${String(email)}, ${String(password)}, ${String(name ?? email.split('@')[0])}) RETURNING id, email, name`
    const user = rows[0]
    const token = `tok_${++seq}_${user.id}`
    sessions.set(token, String(user.id))
    return Response.json({ ok: true, user, token }, { status: 201 })
  })

  app.post('/api/auth/login', async (req: Request) => {
    const { email, password } = await req.json()
    const rows = await sql`SELECT * FROM auth_users WHERE email = ${String(email)} AND password = ${String(password)}`
    if (!rows.length) return Response.json({ ok: false, error: '邮箱或密码错误' }, { status: 401 })
    const user = rows[0]
    const token = `tok_${++seq}_${user.id}`
    sessions.set(token, String(user.id))
    return Response.json({ ok: true, user, token })
  })

  app.get('/api/auth/me', async (req: Request) => {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.replace('Bearer ', '')
    const userId = sessions.get(token)
    if (!userId) return Response.json({ ok: false }, { status: 401 })
    const rows = await sql`SELECT id, email, name FROM auth_users WHERE id = ${userId}`
    if (!rows.length) return Response.json({ ok: false }, { status: 401 })
    return Response.json({ ok: true, user: rows[0] })
  })
}

/** 建表（独立/嵌入共用） */
export async function ensureAuthTables(sql: any): Promise<void> {
  await sql.unsafe('CREATE TABLE IF NOT EXISTS auth_users (id serial PRIMARY KEY, email text UNIQUE, password text, name text)')
}
