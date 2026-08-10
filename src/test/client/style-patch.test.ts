import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h } from '../../ui-dom/vnode.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

describe('style diff：undefined 值移除旧样式（渲染器防线）', () => {
  test('display: undefined 移除旧 display: none', async () => {
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'style-test-1'
    let open = false
    let root: any
    const Cmp = (_: any, ctx: any) => {
      root = ctx
      return () => h('div', { class: 'panel', style: { display: open ? undefined : 'none' } }, 'x')
    }
    await app.mount('#style-test-1', Cmp)
    const panel = el.querySelector('.panel') as HTMLElement
    assert.equal(panel.style.display, 'none', '初始关闭')
    open = true
    root.ui.render()
    await new Promise(r => setTimeout(r, 10))
    assert.equal(panel.style.display, '', '打开后 display 应移除（不再残留 none）')
    open = false
    root.ui.render()
    await new Promise(r => setTimeout(r, 10))
    assert.equal(panel.style.display, 'none', '再次关闭恢复 none')
    app.destroy()
    el.remove()
  })

  test('style 值更新（number → px + 字符串）', async () => {
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'style-test-2'
    let w = 10
    let root: any
    const Cmp = (_: any, ctx: any) => {
      root = ctx
      return () => h('div', { class: 'w', style: { width: w, opacity: w > 50 ? '1' : '0.5' } })
    }
    await app.mount('#style-test-2', Cmp)
    const wEl = el.querySelector('.w') as HTMLElement
    assert.equal(wEl.style.width, '10px')
    assert.equal(wEl.style.opacity, '0.5')
    w = 100
    root.ui.render()
    await new Promise(r => setTimeout(r, 10))
    assert.equal(wEl.style.width, '100px')
    assert.equal(wEl.style.opacity, '1')
    app.destroy()
    el.remove()
  })
})
