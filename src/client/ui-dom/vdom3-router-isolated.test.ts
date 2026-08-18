/**
 * vdom3 router 隔离模式（history: false）——页面内嵌子路由
 *
 * 验证不变量（showcase 平台 app demo 嵌入的基础能力）：
 *   1. 子 router navigate → 只切换子内部页面——宿主 router 页面不被清空
 *      （嵌套共享 history 互踩 popstate 的真实风险：子 pushState → 宿主
 *       popstate 响应 → 宿主路由不匹配 → 清空宿主页面）
 *   2. 子 router 不写 URL——window.location.pathname 不受影响
 *   3. 子 router path()/refresh() 走内部状态
 *   4. 初始路径 = initialPath（无 URL 参与）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { h, createRouter, stream } from './vdom3/index.ts'

before(setupJsdom)

function mkRoot(id: string): HTMLElement {
  const root = document.createElement('div')
  root.id = id
  document.body.appendChild(root)
  return root
}

// 简单页面组件（两阶段异步——createRouter 页面形态）
const Page = (label: string, id: string) => async (_init: any, _ctx: any) =>
  async () => h('div', { id, 'data-label': label }, label)

const sleep = (ms = 20) => new Promise((r) => setTimeout(r, ms))

test('隔离模式：子 navigate 不污染宿主路由/URL，子内部正常切换', async () => {
  stream.reset()
  const hostRoot = mkRoot('host-root')
  const subRoot = mkRoot('sub-root')

  // 宿主 router（默认 history 模式——监听 popstate）
  const host = createRouter(
    [{ path: '/', render: () => h(Page('home', 'host-home'), {}) }],
    hostRoot,
  )
  await sleep()
  assert.ok(hostRoot.querySelector('#host-home'), '宿主首帧渲染')

  // 子 router（隔离模式——initialPath 显式指定，无 URL 参与）
  const sub = createRouter(
    [
      { path: '/sub', render: () => h(Page('sub-a', 'sub-a'), {}) },
      { path: '/sub/next', render: () => h(Page('sub-b', 'sub-b'), {}) },
    ],
    subRoot,
    { initialPath: '/sub', history: false },
  )
  await sleep()
  assert.ok(subRoot.querySelector('#sub-a'), '子首帧渲染（initialPath）')
  assert.equal(sub.path(), '/sub', '子 path() = 内部路径')

  // 子 navigate——关键断言：宿主不被清空、URL 不变
  sub.navigate('/sub/next')
  await sleep()

  assert.ok(subRoot.querySelector('#sub-b'), '子内部页面切换成功')
  assert.ok(!subRoot.querySelector('#sub-a'), '子旧页移除')
  assert.ok(hostRoot.querySelector('#host-home'), '★ 宿主页面未被清空（防互踩）')
  assert.equal(window.location.pathname, '/', '★ URL 未被子导航污染')

  // 子 refresh 走内部路径
  sub.refresh()
  await sleep()
  assert.ok(subRoot.querySelector('#sub-b'), '子 refresh 保持当前内部路径')

  host.close()
  sub.close()
  document.body.removeChild(hostRoot)
  document.body.removeChild(subRoot)
})

test('隔离模式：初始路径缺省为 /；多个子实例互不干扰', async () => {
  stream.reset()
  const r1 = mkRoot('iso-1')
  const r2 = mkRoot('iso-2')

  const a = createRouter(
    [{ path: '/', render: () => h(Page('a', 'iso-a'), {}) }],
    r1,
    { history: false },
  )
  const b = createRouter(
    [
      { path: '/', render: () => h(Page('b0', 'iso-b0'), {}) },
      { path: '/x', render: () => h(Page('b1', 'iso-b1'), {}) },
    ],
    r2,
    { history: false, initialPath: '/x' },
  )
  await sleep()

  assert.ok(r1.querySelector('#iso-a'), '子实例 A 首帧（缺省 /）')
  assert.ok(r2.querySelector('#iso-b1'), '子实例 B 首帧（initialPath /x）')

  // A 导航不影响 B
  a.navigate('/')
  await sleep()
  assert.ok(r2.querySelector('#iso-b1'), '实例 A 导航不影响实例 B')

  a.close()
  b.close()
  document.body.removeChild(r1)
  document.body.removeChild(r2)
})

test('隔离模式：navigate 到不匹配路径 → 清空子容器（404 语义，不影响宿主）', async () => {
  stream.reset()
  const hostRoot = mkRoot('host2')
  const subRoot = mkRoot('sub2')

  const host = createRouter(
    [{ path: '/', render: () => h(Page('home', 'host2-home'), {}) }],
    hostRoot,
  )
  const sub = createRouter(
    [{ path: '/only', render: () => h(Page('only', 'sub-only'), {}) }],
    subRoot,
    { initialPath: '/only', history: false },
  )
  await sleep()

  sub.navigate('/nope')
  await sleep()
  assert.equal(subRoot.childNodes.length, 0, '子容器 404 清空')
  assert.ok(hostRoot.querySelector('#host2-home'), '宿主不受影响')

  host.close()
  sub.close()
  document.body.removeChild(hostRoot)
  document.body.removeChild(subRoot)
})
