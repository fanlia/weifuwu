/**
 * db.ts — decks 表 CRUD（postgres 中间件）
 *
 * outline 与完整 deck 共用一条记录：
 *   status='outline' → outline_json 有值
 *   status='ready'   → deck_json 有值
 */

import type { Outline } from './services/outline.ts'
import type { DeckData } from './pptx/components/layouts.ts'

export type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

export interface DeckRow {
  id: string
  title: string
  theme: string
  status: 'outline' | 'ready'
  outline_json: Outline | null
  deck_json: DeckData | null
  created_at: Date | string
  updated_at: Date | string
}

export async function createOutline(sql: Sql, rec: { id: string; title: string; theme: string; outline: Outline }): Promise<void> {
  await sql`
    INSERT INTO decks (id, title, theme, status, outline_json)
    VALUES (${rec.id}, ${rec.title}, ${rec.theme}, 'outline', ${rec.outline}::jsonb)
  `
}

export async function createDeck(
  sql: Sql,
  rec: { id: string; title: string; theme: string; deck: DeckData },
): Promise<void> {
  await sql`
    INSERT INTO decks (id, title, theme, status, deck_json)
    VALUES (${rec.id}, ${rec.title}, ${rec.theme}, 'ready', ${rec.deck}::jsonb)
  `
}

export async function completeDeckRow(
  sql: Sql,
  rec: { id: string; title: string; theme: string; deck: DeckData },
): Promise<void> {
  await sql`
    UPDATE decks
    SET title = ${rec.title}, theme = ${rec.theme}, status = 'ready', deck_json = ${rec.deck}::jsonb,
        updated_at = NOW()
    WHERE id = ${rec.id}
  `
}

/** jsonb 列在框架封装下返回字符串，统一解析为对象 */
function parseRow(r: any): DeckRow | null {
  if (!r) return null
  return {
    ...r,
    outline_json: typeof r.outline_json === 'string' ? JSON.parse(r.outline_json) : r.outline_json,
    deck_json: typeof r.deck_json === 'string' ? JSON.parse(r.deck_json) : r.deck_json,
  }
}

export async function getDeckRow(sql: Sql, id: string): Promise<DeckRow | null> {
  const rows = await sql`SELECT * FROM decks WHERE id = ${id}`
  return parseRow(rows[0])
}

export async function listDecks(sql: Sql): Promise<DeckRow[]> {
  const rows = await sql`
    SELECT id, title, theme, status, outline_json, deck_json, created_at, updated_at
    FROM decks ORDER BY created_at DESC LIMIT 100
  `
  return rows.map(parseRow).filter((r): r is DeckRow => r !== null)
}

export async function deleteDeck(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM decks WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

export async function updateDeckJson(sql: Sql, id: string, deck: DeckData): Promise<void> {
  await sql`
    UPDATE decks SET deck_json = ${deck}::jsonb, updated_at = NOW() WHERE id = ${id}
  `
}

/** 换主题：theme 列 + deck_json 内 theme 同步更新 */
export async function updateThemeAndDeck(sql: Sql, id: string, deck: DeckData): Promise<void> {
  await sql`
    UPDATE decks SET theme = ${deck.theme}, deck_json = ${deck}::jsonb, updated_at = NOW() WHERE id = ${id}
  `
}

// ── 自定义主题（品牌模板）─────────────────────────────

export interface CustomThemeRecord {
  id: string
  name: string
  colors: Record<string, string>
  logo?: string
}

export async function createCustomTheme(sql: Sql, rec: CustomThemeRecord): Promise<void> {
  await sql`
    INSERT INTO themes (id, name, colors, logo)
    VALUES (${rec.id}, ${rec.name}, ${rec.colors}::jsonb, ${rec.logo ?? null})
  `
}

export async function listCustomThemes(sql: Sql): Promise<CustomThemeRecord[]> {
  const rows = await sql`SELECT id, name, colors, logo FROM themes ORDER BY created_at DESC`
  return rows.map((r: any) => ({
    ...r,
    colors: typeof r.colors === 'string' ? JSON.parse(r.colors) : r.colors,
  }))
}

export async function getCustomTheme(sql: Sql, id: string): Promise<CustomThemeRecord | null> {
  const rows = await sql`SELECT id, name, colors, logo FROM themes WHERE id = ${id}`
  const r = rows[0]
  if (!r) return null
  return { ...r, colors: typeof r.colors === 'string' ? JSON.parse(r.colors) : r.colors }
}
