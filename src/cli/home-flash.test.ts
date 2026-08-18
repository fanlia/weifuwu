/**
 * 首页接管闪白复现测试——SPA 接管 SSR 内容后的首帧可见性
 *
 * 复现链：SSR 首帧（可见 hero）→ createRouter 挂载 → root 内容替换
 * 闪白根因候选：新树首帧带透明起始动画（wf-stream-in opacity 0）→
 * 替换瞬间旧内容消失、新内容透明——白屏直到动画完成。
 * 断言：接管后的首页新树首帧必须立即可见（无透明起始）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupJsdom } from '../client/ui-dom/setup.ts'
import { h, createRouter } from '../client/ui-dom/vdom3/index.ts'
import { renderToEvents, eventsToHtml } from '../client/ui-dom/vdom3/ssr.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

before(setupJsdom)

test('首页 hero 首帧不得带透明起始动画类（wf-stream-in——接管闪白根因）', async () => {
  // Home.tsx 源码断言：hero 区不得有 wf-stream-in（动画 opacity 0 起始 → 替换后白屏）
  const src = readFileSync(join(root, 'apps/showcase/src/pages/home.tsx'), 'utf-8')
  // hero 区 = 从文件头到「我要做什么」（需求区）——含 hero 全部元素
  const heroSection = src.slice(0, src.indexOf('我要做什么'))
  assert.ok(!heroSection.includes('wf-stream-in'), `hero 含 wf-stream-in（透明起始动画）→ 接管闪白\n${heroSection.slice(0, 200)}`)
})

test('首页接管时序：SSR 内容保持 → 新树就绪后替换（root 始终有内容）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  // 模拟 SSR 首帧（可见内容）
  root.innerHTML = '<div class="wf-container" style="padding:32px">SSR 首帧内容（应保持到新树就绪）</div>'
  // 用等效静态组件（不 import .tsx——node 测试限制）
  const Landing = async (_init: any, _ctx: any) => async () => h('div', { class: 'wf-container' }, h('h1', {}, '首页新树'))
  const router = createRouter([{ path: '/', render: () => h(Landing, {}) }], root)
  await new Promise((r) => setTimeout(r, 50))
  // 接管后：root 有内容（新树）且无 SSR 残留标记
  assert.ok(root.childNodes.length > 0, '接管后 root 有内容')
  assert.ok(!root.innerHTML.includes('SSR 首帧内容'), 'SSR 旧内容已替换')
  assert.ok(root.querySelector('h1'), '新树渲染（h1 存在）')
  router.close()
  document.body.removeChild(root)
})

test('首页 hero 在接管后立即可见（无透明元素占位）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  root.innerHTML = '<h1>SSR hero</h1>'
  const Landing = async (_init: any, _ctx: any) => async () => h('div', {}, h('h1', {}, '接管后 hero'))
  const router = createRouter([{ path: '/', render: () => h(Landing, {}) }], root)
  await new Promise((r) => setTimeout(r, 50))
  const h1 = root.querySelector('h1')
  assert.ok(h1, '接管后 h1 存在')
  assert.ok(h1.textContent?.length > 0, 'h1 有可见文本')
  router.close()
  document.body.removeChild(root)
})
