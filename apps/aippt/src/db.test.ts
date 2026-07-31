/**
 * db 集成测试 — 需要本地 postgres（docker compose up -d postgres）
 * 运行: node --env-file=../../.env --test src/db.test.ts
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from 'weifuwu'
import { createOutline, createDeck, completeDeckRow, getDeckRow, listDecks, deleteDeck, updateDeckJson, updateThemeAndDeck, createCustomTheme, listCustomThemes, getCustomTheme, setShareToken, clearShareToken, getDeckByShareToken } from './db.ts'
import type { Outline } from './services/outline.ts'
import type { DeckData } from './pptx/components/layouts.ts'

let pg: any
let sql: any

before(async () => {
  pg = postgres()
  sql = pg.sql
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      colors JSONB NOT NULL,
      logo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'corporate',
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('outline', 'ready')),
      outline_json JSONB,
      deck_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'corporate',
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('outline', 'ready')),
      outline_json JSONB,
      deck_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await sql.unsafe('ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_token TEXT')
})

after(async () => {
  // 清理测试数据，避免污染真实 DB
  await sql`DELETE FROM decks WHERE id LIKE 't%'`
  await pg.close()
})

const outline: Outline = {
  title: 'DB 测试',
  theme: 'corporate',
  slides: [
    { layout: 'cover', title: '标题' },
    { layout: 'bullets', title: '要点', points: ['一'] },
  ],
}

const deck: DeckData = {
  title: 'DB 测试',
  theme: 'corporate',
  slides: [
    { layout: 'cover', title: '标题', subtitle: '副标题' },
    { layout: 'bullets', title: '要点', points: ['一', '二', '三'] },
    { layout: 'thanks', title: '谢谢观看' },
  ],
}

test('db: outline 创建与读取 round-trip', async () => {
  const id = `t${Date.now()}${Math.floor(Math.random() * 1000)}`
  await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
  const row = await getDeckRow(sql, id)
  assert.ok(row)
  assert.equal(row!.status, 'outline')
  assert.equal(row!.outline_json!.slides.length, 2)
  assert.equal(row!.outline_json!.slides[1].layout, 'bullets')
})

test('db: complete 更新同 id 为 ready', async () => {
  const id = `t${Date.now()}${Math.floor(Math.random() * 1000)}`
  await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
  await completeDeckRow(sql, { id, title: deck.title, theme: deck.theme, deck })
  const row = await getDeckRow(sql, id)
  assert.equal(row!.status, 'ready')
  assert.equal(row!.deck_json!.slides.length, 3)
  assert.equal(row!.deck_json!.slides[0].layout, 'cover')
})

test('db: updateThemeAndDeck / updateDeckJson 生效', async () => {
  const id = `t${Date.now()}${Math.floor(Math.random() * 1000)}`
  await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
  await completeDeckRow(sql, { id, title: deck.title, theme: deck.theme, deck })
  await updateThemeAndDeck(sql, id, { ...deck, theme: 'tech' })
  let row = await getDeckRow(sql, id)
  assert.equal(row!.theme, 'tech')
  const changed: DeckData = { ...deck, theme: 'tech', slides: deck.slides.slice(0, 2) }
  await updateDeckJson(sql, id, changed)
  row = await getDeckRow(sql, id)
  assert.equal(row!.deck_json!.slides.length, 2)
})

test('db: createDeck 直接插入 ready 记录（一键/批量路径）', async () => {
  const id = `t${Date.now()}${Math.floor(Math.random() * 1000)}`
  await createDeck(sql, { id, title: deck.title, theme: deck.theme, deck })
  const row = await getDeckRow(sql, id)
  assert.equal(row!.status, 'ready')
  assert.equal(row!.deck_json!.slides.length, 3)
})

test('db: listDecks 排序与 deleteDeck', async () => {
  const a = `t${Date.now()}a`
  const b = `t${Date.now()}b`
  await createOutline(sql, { id: a, title: 'A', theme: 'corporate', outline })
  await createOutline(sql, { id: b, title: 'B', theme: 'corporate', outline })
  const rows = await listDecks(sql)
  const found = rows.filter((r: any) => r.id === a || r.id === b)
  assert.equal(found.length, 2)
  // 最新的在前
  assert.equal(found[0].id, b)

  const ok = await deleteDeck(sql, a)
  assert.equal(ok, true)
  assert.equal(await getDeckRow(sql, a), null)
  assert.equal(await deleteDeck(sql, a), false)
})

test('db: 自定义主题 CRUD', async () => {
  const id = `t${Date.now()}theme`
  await createCustomTheme(sql, { id, name: '测试品牌', colors: { primary: '#FF0000', text: '#111111' }, logo: 'data:image/png;base64,xxx' })
  const rec = await getCustomTheme(sql, id)
  assert.equal(rec!.name, '测试品牌')
  assert.equal(rec!.colors.primary, '#FF0000')
  assert.equal(rec!.logo, 'data:image/png;base64,xxx')
  const list = await listCustomThemes(sql)
  assert.ok(list.some((t) => t.id === id))
  await deleteDeck(sql, id) // themes 表无独立删除，用 decks 清理逻辑不适用——直接删 themes
  await sql`DELETE FROM themes WHERE id = ${id}`
  assert.equal(await getCustomTheme(sql, id), null)
})

test('db: 分享 token 设置/查询/清除', async () => {
  const id = `t${Date.now()}share`
  await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
  await completeDeckRow(sql, { id, title: deck.title, theme: deck.theme, deck })
  await setShareToken(sql, id, 'tok123')
  const byTok = await getDeckByShareToken(sql, 'tok123')
  assert.equal(byTok!.id, id)
  assert.equal(byTok!.deck_json!.title, 'DB 测试')
  await clearShareToken(sql, id)
  assert.equal(await getDeckByShareToken(sql, 'tok123'), null)
})
