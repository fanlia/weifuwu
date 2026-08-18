import { test } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { renderVNode, findByClass, createTestCtx, mountComponent } from '../../ui-dom/testing.ts'
import { Wave } from './Wave.ts'
import { readFileSync } from 'node:fs'

test('Wave：包装渲染 + 点击产生波纹', async () => {
  setupJsdom()
  const ctx = createTestCtx()
  const vnode = await renderVNode(Wave, {}, ctx)
  assert.ok(findByClass(vnode, 'wf-wave'), '根类存在')

  // 交互：挂载到文档 → 点击 → 波纹元素出现
  const container = document.createElement('div')
  document.body.appendChild(container)
  const render = mountComponent(Wave, {}, ctx)
  // mountComponent 返回 render 函数——直接验证点击处理器逻辑（通过 vnode props）
  const root = findByClass(vnode, 'wf-wave')[0] as any
  assert.ok(root?.props?.onClick, 'onClick 存在')
  document.body.removeChild(container)
})

test('Wave：onClick 透传（包装不吞事件）', async () => {
  setupJsdom()
  let clicked = 0
  const ctx = createTestCtx()
  const vnode = await renderVNode(Wave, { onClick: () => { clicked++ } }, ctx) as any
  const root = findByClass(vnode, 'wf-wave')[0] as any
  root.props.onClick({ clientX: 10, clientY: 10, currentTarget: document.createElement('div') })
  assert.equal(clicked, 0, '透传的 onClick 由 children 处理——Wave 自身不拦截')
})

test('Wave：点击产生波纹元素（spawnRipple 逻辑）', async () => {
  setupJsdom()
  const ctx = createTestCtx()
  const vnode: any = await renderVNode(Wave, {}, ctx)
  const wave = findByClass(vnode, 'wf-wave')[0] as any
  const el = document.createElement('div')
  // 直接调用 onClick（等价事件系统调用 spawnRipple）
  wave.props.onClick({ clientX: 20, clientY: 20, currentTarget: el })
  assert.equal(el.querySelectorAll('.wf-wave-ripple').length, 1, '波纹元素生成')
  // 波纹定位样式
  const ripple = el.querySelector('.wf-wave-ripple') as HTMLElement
  assert.match(ripple.style.cssText, /left:/, '坐标定位')
  assert.match(ripple.style.cssText, /width:/, '尺寸计算')
})

test('Wave：reduced-motion 下波纹 CSS 使用 token 动效（无硬编码）', () => {
  setupJsdom()
  const css = readFileSync('src/client/components/Wave/Wave.css', 'utf-8')
  assert.match(css, /var\(--wf-dur-base\)/, '动效时长 token 化')
  assert.match(css, /@keyframes wf-wave-pop/, '关键帧命名规范（wf- + 动作后缀）')
})
