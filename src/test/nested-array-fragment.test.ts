/**
 * 嵌套数组 = 隐式 Fragment（vnode 保持用户结构——数组项在渲染/diff 中按 Fragment 处理）
 *
 * 规则表 §1-20：`[xx, [yy, zz]]` → 数组项 ≡ Fragment：展开为兄弟节点
 * 规则表 §3-46：嵌套数组项在父数组有 key；其内部子项各自独立分配默认下标——层级独立，key 不跨层
 * 规则表 §3-49：data-wf-key 层级语义 = 相对最近父层级
 *
 * 平铺实现（旧）把 [[a,b],c] 展开成 [a,b,c]——key 平铺 0/1/2——违反层级独立
 * （内层 b 的 '1' 与外层 c 的 '1' 是不同层级——平铺后撞车 → auth 切换残留）。
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

describe('嵌套数组 = 隐式 Fragment（层级独立 key）', () => {
  it('data-wf-key 层级独立：[[a,b],c] → 内层 a="0"/b="1"、外层 c="1"（相对最近父层级）', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const browser = createClientBrowser()
    const { ctx } = createVdomContext({ root: container, browser })
    const handle = mountRoot({ root: container, ctx, browser })
    // 嵌套数组：外层 [ [a,b], c ]（数组项 = 隐式 Fragment）
    await handle.mount(h('div', { class: 'w' }, [[h('i', { id: 'a' }), h('i', { id: 'b' })], h('i', { id: 'c' })]))
    const keys = ['a', 'b', 'c'].map(id => container.querySelector(`#${id}`)?.getAttribute('data-wf-key'))
    assert.deepEqual(keys, ['0', '1', '1'],
      `层级独立 key：内层数组项 [a,b] 各得 0/1（内层下标），外层项 c 得 1（外层下标）——实际: ${keys.join(',')}`)
    handle.close?.()
    document.body.removeChild(container)
  })

  it('数组项重排（默认下标）：位置复用不重建——DOM 顺序跟随', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const browser = createClientBrowser()
    const { ctx } = createVdomContext({ root: container, browser })
    const handle = mountRoot({ root: container, ctx, browser })
    const { patchValue } = await import('../ui-dom/vdom/diff.ts')
    const { buildVNode } = await import('../ui-dom/vdom/build.ts')
    const { createRegistry } = await import('../ui-dom/vdom/registry.ts')
    const reg = createRegistry()

    const mk = (x: string) => h('i', { id: x, 'data-l': x })
    const v1 = h('div', { class: 'w' }, [mk('a'), mk('b')], mk('c'))
    await handle.mount(v1)
    assert.deepEqual(['a', 'b', 'c'].map(id => container.querySelector(`#${id}`)?.dataset.l), ['a', 'b', 'c'])

    // 重排：外层数组项 [a,b] 与 c 交换位置（外层数组 [ [a,b], c ] → [ c, [a,b] ]）
    const v2 = h('div', { class: 'w' }, h('i', { id: 'c2', 'data-l': 'c2' }), [mk('a2'), mk('b2')])
    const built = await buildVNode(v2, ctx, v1, reg)
    patchValue(container, (v1 as any).el, v1, built, { browser, registry: reg })
    const order = [...container.querySelector('.w')!.children].map(n => n.id)
    assert.deepEqual(order, ['c2', 'a2', 'b2'], `数组项整体移动（范围锚点）——实际: ${order.join(',')}`)
    handle.close?.()
    document.body.removeChild(container)
  })
})
