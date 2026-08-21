/**
 * 场景注册表——vdom 引擎 DOM 行为测试（场景 = 路由 = 真实页面）
 *
 * 分层（与契约层互补）：
 * - 契约层（src/test/contract/）——命令流断言（纯数据——node 直跑）
 * - 场景层（本目录）——DOM 行为断言（SSR 服务化 + playwright——真实浏览器）
 *
 * 每个场景 = 一个 vnode 工厂（客户端执行——组件状态真实流转）+ e2e 断言。
 * 场景是引擎真实 bug 的回归样本（§6.3 占位事故 / 组件复用 / keyed 身份 / portal）。
 */
import { h, type Component, type VNode } from '../../client/vdom/index.ts'
import { createPortal } from '../../client/vdom/core/node/portal.ts'

export interface Scenario {
  id: string
  title: string
  /** 客户端场景入口（组件工厂——mount 后返回 renderFn） */
  render: Component<Record<string, never>, unknown>
  /** SSR 模式：server 端 uiSsr 渲染 HTML（首帧吸收测试）——默认 false（空 root 客户端渲染） */
  ssr?: boolean
}

// ── 场景 11：SSR 吸收（首帧结构对齐复用——焦点/状态保持） ─────────────
// server 端 uiSsr 渲染（SSR HTML 首屏）→ 客户端 uiServe 接管——
// 结构吸收：create 命令复用已有 DOM（同一节点引用——输入焦点保持）。
const SsrAdopt = (_init: Record<string, never>, ctx: any) => {
  let count = 0
  return () =>
    h('div', { class: 'ssr-scene' },
      h('input', { class: 'ssr-input', placeholder: '输入' }),
      h('button', { class: 'ssr-btn', onClick: () => { count += 1; ctx.render() } }, `点击 ${count}`),
      h('span', { class: 'ssr-text' }, 'SSR 内容'),
      false,
      h('b', { class: 'ssr-bold' }, '粗体'),
    )
}

// ── 场景 1：占位同构（§6.3 提交按钮消失事故回归） ──────────────────────
// children 数组含 false 占位（{cond && <X/>}）——render 阶段建占位节点——
// childNodes 长度恒等于 children 长度——diff 不误删兄弟（按钮保留）；
// 空洞 → 真实元素切换（Alert 出现在按钮前——位置正确）。
const HolePlaceholder = (_init: Record<string, never>, ctx: any) => {
  let show = false
  return () =>
    h('div', { class: 'hole-scene' },
      h('span', { class: 'field-item' }, '字段'),
      show ? h('div', { class: 'alert-item' }, '错误提示') : false,
      h('button', {
        class: 'submit-btn',
        onClick: () => { show = true; ctx.render() },
      }, '提交表单'),
    )
}

// ── 场景 2：组件复用（工厂不重跑——内部 let 状态保持） ──────────────────
// 同位置同类型组件复用 _render——父重渲染不重挂——内部状态（count）保持。
const Counter = (_init: Record<string, never>, ctx: any) => {
  let count = 0
  return () =>
    h('button', {
      class: 'counter-btn',
      onClick: () => { count += 1; ctx.render() },
    }, `计数 ${count}`)
}

const ComponentReuse = (_init: Record<string, never>, ctx: any) => {
  let label = '初始'
  return () =>
    h('div', { class: 'reuse-scene' },
      h(Counter, {}),
      h('button', {
        class: 'relabel-btn',
        onClick: () => { label = label + '!'; ctx.render() },
      }, `改标签 ${label}`),
    )
}

// ── 场景 3：keyed 身份跟随（重排状态不漂移） ───────────────────────────
// keyed 列表重排——key 身份跟随内容——内部状态（勾选）不漂移。
const KeyedItem = (_init: Record<string, never>, ctx: any) => {
  let picked = false
  return (props: any) =>
    h('div', { class: 'keyed-item' },
      h('span', { class: 'item-name' }, props.name),
      h('button', {
        class: 'pick-btn',
        onClick: () => { picked = !picked; ctx.render() },
      }, picked ? '已选' : '未选'),
    )
}

const KeyedReorder = (_init: Record<string, never>, ctx: any) => {
  let items = ['甲', '乙', '丙']
  return () =>
    h('div', { class: 'reorder-scene' },
      h('button', {
        class: 'shuffle-btn',
        onClick: () => {
          items = [items[2], items[0], items[1]]
          ctx.render()
        },
      }, '重排'),
      h('div', { class: 'item-list' },
        items.map((name) => h(KeyedItem, { key: name, name })),
      ),
    )
}

// ── 场景 4：portal 往返（弹层增删——#__wf_portal） ─────────────────────
// createPortal 打开 → 内容在 #__wf_portal；关闭 → 移除（不残留）。
const PortalToggle = (_init: Record<string, never>, ctx: any) => {
  let open = false
  return () =>
    h('div', { class: 'portal-scene' },
      h('button', {
        class: 'portal-btn',
        onClick: () => { open = !open; ctx.render() },
      }, open ? '关闭' : '打开'),
      open ? createPortal(h('div', { class: 'portal-content' }, '弹层内容'), 'scenario-portal') : null,
    )
}

// ── 场景 5：diff 就地更新（节点不重建——焦点保持前提） ────────────────
const DiffUpdate = (_init: Record<string, never>, ctx: any) => {
  let label = 'v1'
  return () =>
    h('div', { class: 'diff-scene', 'data-label': label },
      h('button', { class: 'update-btn', onClick: () => { label = 'v2'; ctx.render() } }, '更新'),
      h('span', { class: 'label' }, label),
    )
}

// ── 场景 6：事件重绑（props 变化 → 旧 handler 解绑——引用比较） ────────
const EventsScene = (_init: Record<string, never>, ctx: any) => {
  let version = 0
  let last = ''
  return () =>
    h('div', { class: 'events-scene' },
      h('button', {
        class: 'ev-btn',
        onClick: version === 0 ? () => { last = 'v0'; ctx.render() } : () => { last = 'v1'; ctx.render() },
      }, '触发'),
      h('button', { class: 'swap-btn', onClick: () => { version = 1; ctx.render() } }, '换 handler'),
      h('span', { class: 'ev-last' }, last),
    )
}

// ── 场景 7：Fragment/数组展开（无中间层——DOM 平铺） ───────────────────
const FragmentScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'frag-scene' },
      [h('i', { class: 'f1' }, 'i1'), h('i', { class: 'f2' }, 'i2')],
      h('b', { class: 'f3' }, 'b1'),
    )

// ── 场景 8：ref 生命周期（挂载/卸载——切换触发 ref(null) 清理） ─────────
const RefScene = (_init: Record<string, never>, ctx: any) => {
  let mounted = 0
  let cleaned = 0
  let show = true
  const boxRef = (el: unknown) => { if (el) mounted++; else cleaned++ }
  return () =>
    h('div', { class: 'ref-scene' },
      show ? h('div', { class: 'ref-box', ref: boxRef }, '盒子') : null,
      h('button', { class: 'toggle-btn', onClick: () => { show = !show; ctx.render() } }, '切换'),
      h('span', { class: 'ref-stats' }, `m:${mounted} c:${cleaned}`),
    )
}

// ── 场景 9：navigate（链接拦截 → pushState + 整树替换） ────────────────
const NavigateScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'nav-scene' },
      h('p', {}, '导航场景'),
      h('a', { href: '/scenario/component-reuse', class: 'nav-link' }, '去组件复用场景'),
    )

// ── 场景 10：unmount/dispose（handle.unmount——DOM/portal 完整清理） ─────
const UnmountScene = (_init: Record<string, never>, ctx: any) => {
  let open = false
  return () =>
    h('div', { class: 'unmount-scene' },
      h('button', { class: 'pop-btn', onClick: () => { open = !open; ctx.render() } }, '开弹层'),
      h('button', { class: 'unmount-btn', onClick: () => { (window as any).__scenarioHandle?.unmount() } }, '卸载'),
      open ? createPortal(h('div', { class: 'um-portal' }, '弹层'), 'unmount-portal') : null,
    )
}

export const scenarios: Scenario[] = [
  { id: 'hole-placeholder', title: '占位同构（§6.3 按钮保留回归）', render: HolePlaceholder },
  { id: 'component-reuse', title: '组件复用（工厂不重跑——状态保持）', render: ComponentReuse },
  { id: 'keyed-reorder', title: 'keyed 身份跟随（重排状态不漂移）', render: KeyedReorder },
  { id: 'portal-toggle', title: 'portal 往返（弹层增删不残留）', render: PortalToggle },
  { id: 'diff-update', title: 'diff 就地更新（节点不重建——焦点保持）', render: DiffUpdate },
  { id: 'events-rebind', title: '事件重绑（handler 引用变化——旧解绑新绑）', render: EventsScene },
  { id: 'fragment-expand', title: 'Fragment/数组展开（DOM 平铺无中间层）', render: FragmentScene },
  { id: 'ref-lifecycle', title: 'ref 生命周期（挂载/卸载清理）', render: RefScene },
  { id: 'navigate', title: 'navigate（链接拦截 → pushState + 整树替换）', render: NavigateScene },
  { id: 'unmount-dispose', title: 'unmount（handle.unmount——DOM/portal 清理）', render: UnmountScene },
  { id: 'ssr-adopt', title: 'SSR 吸收（首帧结构复用——输入焦点保持）', render: SsrAdopt, ssr: true },
]

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
