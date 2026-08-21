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

export const scenarios: Scenario[] = [
  { id: 'hole-placeholder', title: '占位同构（§6.3 按钮保留回归）', render: HolePlaceholder },
  { id: 'component-reuse', title: '组件复用（工厂不重跑——状态保持）', render: ComponentReuse },
  { id: 'keyed-reorder', title: 'keyed 身份跟随（重排状态不漂移）', render: KeyedReorder },
  { id: 'portal-toggle', title: 'portal 往返（弹层增删不残留）', render: PortalToggle },
]

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
