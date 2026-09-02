/**
 * AuthPage 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（认证卡宽度契约——2027-xx 登录框窄修复）：
 * - 卡片宽度 100% + maxWidth 360px（认证卡标准宽——antd 登录 368/shadcn max-w-sm
 *   同类语义）——旧实现无宽度约束：Card 收缩到内容宽（input 固有 ~226px）——
 *   1280 视口登录框仅 260px 实测（narrow 直接根因）
 * - form 无死类（wf-auth-form 从未定义——删除）
 * - 结构：logo/title/subtitle + form + submit + footer 槽位
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthPage } from './AuthPage.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('卡片宽度契约：100% + maxWidth 360px（认证卡标准宽——修复登录框窄）', async () => {
  const h = await mount(AuthPage, { title: '登录', submitLabel: '登 录' })
  const ct = createTable(h.cmds)
  const cards = [...ct.values()].filter((c) => c.tag === 'div' && String(c.attrs?.class ?? '').includes('wf-card'))
  assert.equal(cards.length, 1, 'Card 恰一个')
  const style = (cards[0].attrs.style ?? {}) as Record<string, string>
  assert.equal(style.width, '100%', 'width 100%')
  assert.equal(style.maxWidth, '360px', 'maxWidth 360px（实际: ' + JSON.stringify(style) + '）')
})

test('form 无死类（wf-auth-form 已删除——布局类面纪律）', async () => {
  const h = await mount(AuthPage, { title: '登录', submitLabel: '登 录' })
  const ct = createTable(h.cmds)
  const forms = [...ct.values()].filter((c) => c.tag === 'form')
  assert.equal(forms.length, 1, 'form 恰一个')
  assert.ok(!String(forms[0].attrs.class ?? '').includes('wf-auth-form'), '无未定义类（实际: ' + forms[0].attrs.class + '）')
})

test('结构槽位：title/subtitle/children/submit/footer', async () => {
  const h = await mount(AuthPage, {
    title: '登录',
    subtitle: '多租户 AI 平台',
    submitLabel: '登 录',
    children: '字段插槽',
    footer: '底部链接',
  })
  const texts = h.cmds.filter((c) => c.op === 'createText').map((c: any) => c.value)
  for (const t of ['登录', '多租户 AI 平台', '字段插槽', '登 录', '底部链接']) {
    assert.ok(texts.includes(t) || texts.join('').includes(t), `槽位渲染: ${t}`)
  }
})
