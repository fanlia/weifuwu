/**
 * todo 后端 API——可复用注册函数（独立 server 与 showcase 嵌入共享同一实现）
 * 契约：registerTodoApi(app, sql)——sql 为 Sql 契约（MemorySql/postgres 均可）
 */
import type { Router } from 'weifuwu'

export function registerTodoApi(app: Router, sql: any): void {
  app.get('/api/todos', async () => {
    const rows = await sql`SELECT * FROM todos ORDER BY id DESC`
    return Response.json({ rows })
  })
  app.post('/api/todos', async (req: Request) => {
    const { name } = await req.json()
    const rows = await sql`INSERT INTO todos (name) VALUES (${String(name)}) RETURNING id, name, done`
    return Response.json({ row: rows[0] }, { status: 201 })
  })
  app.patch('/api/todos/:id', async (req: Request, ctx: any) => {
    const { done } = await req.json()
    await sql`UPDATE todos SET done = ${!!done} WHERE id = ${Number((ctx as any).params.id)}`
    return Response.json({ ok: true })
  })
  app.delete('/api/todos/:id', async (req: Request, ctx: any) => {
    await sql`DELETE FROM todos WHERE id = ${Number((ctx as any).params.id)}`
    return Response.json({ ok: true })
  })
}
