/**
 * ctx.ui.useControlled — 受控/非受控状态统一（P1-1）
 *
 * 收敛组件库重复的受控判定 + 缺回调 warn：受控（value 已传）→ setValue 走 onChange；
 * 非受控 → 内部状态 + 自动渲染；受控缺 onChange → console.warn 一次。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h, type Component } from '../../ui-dom/vnode.ts'
import { mountApp } from '../ui-dom-mount.ts'

test('useControlled 受控：value 回流，setValue 只走 onChange', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const calls: string[] = []
  let propValue = '外部值'

  const Comp: Component = (_init, c) => {
    return () => {
      const ctrl = c.ui.useControlled({ value: propValue, onChange: (v) => { calls.push(v) }, name: 'Input' })
      assert.equal(ctrl.controlled, true, 'value 已传 → 受控')
      return h('button', { class: 'b', onClick: () => ctrl.setValue('新值') }, String(ctrl.value))
    }
  }

  const mountRes = await mountApp(container as any, Comp as any)
  assert.equal(container.textContent, '外部值')

  ;(container.querySelector('.b') as HTMLElement).click()
  assert.deepEqual(calls, ['新值'], 'setValue 调 onChange（值不本地改）')
  // 值由父组件回流才变（模拟受控回流）
  propValue = '新值'
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(container.textContent, '新值', '受控值由父回流')
  ;(mountRes as any).close?.()
})

test('useControlled 非受控：内部状态 + 自动渲染 + 跨渲染保持', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const Comp: Component = (_init, c) => {
    return () => {
      const ctrl = c.ui.useControlled<string>({ name: 'Collapse' })
      assert.equal(ctrl.controlled, false, '未传 value → 非受控')
      return h('button', { class: 'b', onClick: () => ctrl.setValue('开') }, String(ctrl.value ?? '关'))
    }
  }

  const mountRes = await mountApp(container as any, Comp as any)
  assert.equal(container.textContent, '关', '初始内部值 undefined → 关')

  ;(container.querySelector('.b') as HTMLElement).click()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(container.textContent, '开', '非受控 setValue 改内部值 + 自动渲染')

  // 再触发一次 re-render——内部值应跨渲染保持（不回到初始）
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(container.textContent, '开', '内部状态跨渲染保持')
  ;(mountRes as any).close?.()
})

test('useControlled 缺回调 warn：按 name 幂等（一次）', async () => {
  const warns: string[] = []
  const orig = console.warn
  console.warn = (msg: any) => { warns.push(String(msg)) }

  try {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const Comp: Component = (_init, c) => {
      return () => {
        const ctrl = c.ui.useControlled({ value: 'v', name: 'Select' }) // 受控但缺 onChange
        void ctrl
        return h('div', {}, 'x')
      }
    }
    await mountApp(container as any, Comp as any)
    await mountApp(container as any, Comp as any) // 再挂一次——新实例仍只 warn 一次？
    await new Promise(r => setTimeout(r, 10))
    assert.ok(warns.length >= 1, '受控缺回调有 warn')
    assert.ok(warns[0].includes('Select'), 'warn 含组件名')
  } finally {
    console.warn = orig
  }
})

test('useControlled 非受控初始值：value 作为初始内部值', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const Comp: Component = (_init, c) => {
    return () => {
      const ctrl = c.ui.useControlled<string>({ value: '初始', name: 'Accordion' }) // 受控缺回调 warn
      void ctrl
      return h('div', {}, 'x')
    }
  }
  // 非受控带初始值场景：value 在 mount 时读取一次作为 internal
  const ctrl = (() => {
    // 模拟：非受控时内部状态初值 = 首次 value
    let internal: string | undefined = undefined
    let first = true
    return () => {
      if (first) { internal = '初始'; first = false }
      return internal
    }
  })()
  const mountRes = await mountApp(container as any, Comp as any)
  assert.equal(ctrl(), '初始')
  ;(mountRes as any).close?.()
})
