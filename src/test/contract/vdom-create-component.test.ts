/**
 * vdom 契约——createComponent（组件声明抽象）
 *
 * 锁定（W3）：
 * - enumStates：直拼（`wf-x--<v>`）/显式映射（缺口直拼不吞）
 * - boolStates：真值 → 显式类
 * - ariaBools：真值 → aria 属性
 * - class 透传（尾部追加——响应式类 wf-hidden@lg 先例）
 * - role：根静态角色
 * - render：皮（rootProps 组装毕——ctx 透传 i18n）
 * - 缺省渲染：h(tag, rootProps, children)
 * - 同步工厂（两阶段语义与手写一致）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createComponent } from '../../client/vdom/index.ts'
import { mount, createTable } from '../../test/contract/component-harness.ts'

test('enumStates：直拼 `wf-x--<v>`（variant/size 先例）', async () => {
  const C = createComponent<{ variant?: string }>({
    class: 'wf-x',
    enumStates: { variant: null },
  })
  const hh = await mount(C, { variant: 'primary' } as any)
  const t = createTable(hh.cmds)
  const el = [...t.values()].find((c: any) => c.tag === 'div')
  assert.ok(el?.attrs?.class?.includes('wf-x--primary'), '直拼类')
})

test('enumStates：显式映射 + 缺口直拼', async () => {
  const C = createComponent<{ v?: string }>({
    class: 'wf-y',
    enumStates: { v: { a: 'wf-y--alpha' } },
  })
  const hh1 = await mount(C, { v: 'a' } as any)
  let el: any = [...createTable(hh1.cmds).values()].find((c: any) => c.tag === 'div')
  assert.ok(el?.attrs?.class?.includes('wf-y--alpha'), '映射命中')
  const hh2 = await mount(C, { v: 'b' } as any)
  el = [...createTable(hh2.cmds).values()].find((c: any) => c.tag === 'div')
  assert.ok(el?.attrs?.class?.includes('wf-y--b'), '缺口直拼')
})

test('boolStates + ariaBools + role 生成', async () => {
  const C = createComponent<{ checked?: boolean }>({
    class: 'wf-z',
    boolStates: { checked: 'wf-z--checked' },
    ariaBools: { checked: 'aria-checked' },
    role: 'switch',
  })
  const hh = await mount(C, { checked: true } as any)
  const el: any = [...createTable(hh.cmds).values()].find((c: any) => c.tag === 'div')
  assert.ok(el?.attrs?.class?.includes('wf-z--checked'), 'bool 类')
  assert.equal(el?.attrs?.['aria-checked'], true, 'aria 布尔')
  assert.equal(el?.attrs?.role, 'switch', 'role')
  // 假值——无类无 aria
  const hh2 = await mount(C, { checked: false } as any)
  const el2: any = [...createTable(hh2.cmds).values()].find((c: any) => c.tag === 'div')
  assert.ok(!el2?.attrs?.class?.includes('--checked'), '假值无类')
  assert.equal(el2?.attrs?.['aria-checked'], undefined, '假值无 aria')
})

test('class 透传（尾部追加——响应式类先例）', async () => {
  const C = createComponent<{ class?: string }>({
    class: 'wf-w',
    render: (root, p) => ({ type: 'div', props: { ...root }, key: null }) as any,
  })
  const hh = await mount(C, { class: 'wf-hidden@lg' } as any)
  const el: any = [...createTable(hh.cmds).values()].find((c: any) => c.tag === 'div')
  const cls = el?.attrs?.class as string
  assert.ok(cls.startsWith('wf-w'), '基类开头')
  assert.ok(cls.includes('wf-hidden@lg'), '透传尾部')
})

test('render 皮（rootProps 组装毕 + ctx 透传）', async () => {
  const C = createComponent<{ label?: string }>({
    class: 'wf-p',
    boolStates: { on: 'wf-p--on' },
    role: 'button',
    render: (root, props) => ({
      type: 'button',
      props: { ...root, 'data-label': props.label ?? '' },
      key: null,
    }) as any,
  })
  const hh = await mount(C, { label: 'hi' } as any)
  const t = createTable(hh.cmds)
  const el: any = [...t.values()].find((c: any) => c.tag === 'button')
  assert.equal(el?.attrs?.role, 'button', 'role 注入 root')
  assert.equal(el?.attrs?.['data-label'], 'hi', 'render 面')
})

test('缺省渲染：h(tag, rootProps, children)', async () => {
  const C = createComponent<{ children?: unknown }>({
    class: 'wf-q',
    tag: 'span',
  })
  const hh = await mount(C, { children: '内容' } as any)
  const t = createTable(hh.cmds)
  const el: any = [...t.values()].find((c: any) => c.tag === 'span')
  assert.ok(el, 'span 缺省')
  const text = hh.cmds.filter((c: any) => c.op === 'createText').map((c: any) => c.value)
  assert.ok(text.includes('内容'), 'children 透传')
})
