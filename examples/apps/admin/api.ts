/**
 * admin 后端 API——订单表（注册函数：独立 server 与 showcase 嵌入共享）
 */
import type { Router } from 'weifuwu'

export function registerAdminApi(app: Router, sql: any): void {
  app.get('/api/admin/orders', async () => {
    const rows = await sql`SELECT * FROM admin_orders ORDER BY id DESC LIMIT 50`
    return Response.json({ rows })
  })
}

/** 建表 + 种子数据（独立/嵌入共用） */
export async function ensureAdminTables(sql: any): Promise<void> {
  await sql.unsafe('CREATE TABLE IF NOT EXISTS admin_orders (id serial PRIMARY KEY, customer text, amount numeric, status text, date text)')
  const rows = await sql`SELECT COUNT(*) AS n FROM admin_orders`
  if (Number(rows[0]?.n) > 0) return
  const seed = [
    ['张伟', 1280, 'paid', '2026-08-10'], ['李娜', 560, 'pending', '2026-08-11'],
    ['王强', 3200, 'shipped', '2026-08-12'], ['赵敏', 890, 'paid', '2026-08-13'],
    ['陈杰', 2100, 'pending', '2026-08-14'], ['刘洋', 450, 'paid', '2026-08-15'],
    ['孙丽', 1750, 'shipped', '2026-08-16'], ['周涛', 980, 'paid', '2026-08-17'],
  ]
  for (const [customer, amount, status, date] of seed) {
    await sql`INSERT INTO admin_orders (customer, amount, status, date) VALUES (${customer}, ${amount}, ${status}, ${date})`
  }
}
