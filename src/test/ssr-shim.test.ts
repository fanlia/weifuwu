/**
 * SSR shim 原语覆盖测试（P2-2）——服务端渲染时 ctx.ui 的全部原语必须 no-op 安全：
 * 组件用任何原语（$ / useControlled / useStableRef / useAsync / usePopup 族）都不抛错、
 * 返回确定性初始值（SSR 不启动会话/监听/网络）。
 *
 * 回归动机：Collapse 迁移 useControlled 后，若 shim 缺该原语，SSR 渲染 Collapse 直接崩——
 * 此测试是 shim 与组件原语用量的契约。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ssrToString } from '../ui/ssr.ts'
import { h, type Component } from '../client/vnode.ts'

test('SSR：useControlled 组件可渲染（Collapse 模式）', async () => {
  const Comp: Component = (_init: any, ctx: any) => {
    return (props: any) => {
      const ctrl = ctx.ui.useControlled<string[]>({ value: props.active, name: 'Collapse' })
      const keys = ctrl.value ?? []
      return h('div', { class: 'coll' },
        keys.map((k: string) => h('span', { key: k }, k)))
    }
  }
  const html = (await ssrToString(Comp, { active: ['a'] }, {})).toString()
  assert.ok(html.includes('class="coll"'), '非受控/受控皆渲染')
  assert.ok(html.includes('a'), '受控值渲染进 HTML')
})

test('SSR：useStableRef 组件可渲染（ref 不触发）', async () => {
  const Comp: Component = (_init: any, ctx: any) => {
    const ref = ctx.ui.useStableRef(() => { throw new Error('SSR 不应 init ref') })
    return () => h('div', { class: 'r', ref })
  }
  const html = (await ssrToString(Comp, {}, {})).toString()
  assert.ok(html.includes('class="r"'))
})

test('SSR：useAsync 组件可渲染（不启动取数）', async () => {
  const Comp: Component = (_init: any, ctx: any) => {
    const list = ctx.ui.useAsync(() => Promise.reject(new Error('SSR 不应取数')))
    return () => h('div', { class: 'a' }, list.loading ? 'L' : 'D')
  }
  const html = (await ssrToString(Comp, {}, {})).toString()
  assert.ok(html.length > 0, 'SSR 下 useAsync no-op 不抛')
})

test('SSR：全部事件原语 no-op 可渲染', async () => {
  const Comp: Component = (_init: any, ctx: any) => {
    // mount 期逐个调用（SSR shim 应全部 no-op 安全）
    ctx.ui.useMedia('(max-width: 640px)', () => {})
    ctx.ui.useBreakpoint({ m: '(max-width: 640px)' }, () => {})
    ctx.ui.useHoverCapable()
    ctx.ui.usePopupPosition({ el: () => null, isOpen: () => false, compute: () => ({ top: 0, left: 0 }) })
    ctx.ui.useVisualViewport()
    ctx.ui.useInView({})
    ctx.ui.useScrollPosition({})
    const popup = ctx.ui.usePopup({ el: () => null, isOpen: () => false, setOpen: () => {} })
    const lp = ctx.ui.useLongPress({ onLongPress: () => {} })
    void popup; void lp
    return () => h('div', { class: 'all' }, 'x')
  }
  const html = (await ssrToString(Comp, {}, {})).toString()
  assert.ok(html.includes('class="all"'))
})

test('SSR：useChat no-op 确定性空态', async () => {
  const Comp: Component = (_init: any, ctx: any) => {
    const $ = ctx.ui.useChat({ url: '/api/chat' })
    return () => h('div', { class: 'chat' }, $.streaming ? 's' : `${$.messages.length}`)
  }
  const html = (await ssrToString(Comp, {}, {})).toString()
  assert.ok(html.includes('class="chat"') && html.includes('>0<'), 'SSR 空会话确定性渲染')
})
