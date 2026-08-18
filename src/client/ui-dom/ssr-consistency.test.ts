/**
 * SSR/事件流一致性测试——SSR 渲染 HTML vs 客户端事件流渲染 DOM 对比
 *
 * 定位（showcase 闪白/跳转问题）：SSR 首帧（eventsToHtml）与客户端
 * （replay 事件流）渲染同一组件树——若结果不一致 → SPA 接管时内容变化 = 闪变。
 * 同一事件流理论上应产出同构结果——差异即序列化/应用层 bug。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { renderToEvents, eventsToHtml } from './vdom3/ssr.ts'
import { h } from './vdom3/jsx.ts'
import { replay } from './vdom3/replay.ts'
import { Markdown } from '../components/Markdown/Markdown.ts'
import { Button } from '../components/Button/Button.ts'

before(setupJsdom)

/** 同一事件流 → SSR HTML vs replay DOM（规范化后对比） */
async function ssrVsReplay(vnode: any): Promise<{ ssr: string; dom: string }> {
  const events = await renderToEvents(vnode)
  const ssr = eventsToHtml(events)
  const root = document.createElement('div')
  document.body.appendChild(root)
  replay(events, root)
  const dom = root.innerHTML
  document.body.removeChild(root)
  return { ssr, dom }
}

/** 规范化：压缩空白 + 去掉 data-v3-id（客户端运行时分配——SSR 有意不输出） */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/ data-v3-id="[^"]*"/g, '').trim()

test('一致性：基础元素（属性/文本/嵌套）', async () => {
  const { ssr, dom } = await ssrVsReplay(
    h('div', { class: 'a b', id: 'x' }, [h('span', {}, '文本'), h('button', { disabled: true }, '按钮')]),
  )
  assert.equal(norm(ssr), norm(dom), `SSR/事件流不一致\nSSR: ${ssr}\nDOM: ${dom}`)
})

test('一致性：style 对象属性（cssText 序列化——[object Object] 回归防线）', async () => {
  const { ssr, dom } = await ssrVsReplay(
    h('div', { style: { padding: '8px', color: 'red' } }, '带样式'),
  )
  assert.equal(norm(ssr), norm(dom), `style 不一致\nSSR: ${ssr}\nDOM: ${dom}`)
  assert.ok(!ssr.includes('[object Object]') && !dom.includes('[object Object]'), `style 必须是 cssText 非 [object Object]\nSSR: ${ssr}\nDOM: ${dom}`)
  assert.match(ssr, /padding:8px;color:red/, 'SSR cssText 格式')
  assert.match(dom, /padding:8px;color:red/, 'DOM cssText 格式')
})

test('一致性：Button 组件（事件/样式类）', async () => {
  const { ssr, dom } = await ssrVsReplay(
    h(Button, { variant: 'primary', size: 'md' }, '提交'),
  )
  assert.equal(norm(ssr), norm(dom), `Button 不一致\nSSR: ${ssr}\nDOM: ${dom}`)
})

test('一致性：Markdown 渲染（showcase 文档页核心）', async () => {
  const { ssr, dom } = await ssrVsReplay(
    h(Markdown, { content: '# 标题\n\n正文 **加粗** 与 `code`\n\n- 列表项一\n- 列表项二' }),
  )
  assert.equal(norm(ssr), norm(dom), `Markdown 不一致\nSSR: ${ssr}\nDOM: ${dom}`)
})

test('一致性：首页 hero 结构（含 stream-in 类与内联样式）', async () => {
  const hero = h('div', { class: 'wf-container wf-stack', style: '--wf-max:980px;--wf-gap:24px;padding:32px 16px' },
    h('div', { class: 'wf-stream-in' },
      h('h1', { style: { fontSize: '2.25rem', margin: 0 } }, 'weifuwu 发展引擎')))
  const { ssr, dom } = await ssrVsReplay(hero)
  assert.equal(norm(ssr), norm(dom), `hero 不一致\nSSR: ${ssr}\nDOM: ${dom}`)
})
