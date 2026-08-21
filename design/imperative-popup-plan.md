# 弹窗命令式改造计划（长期维护方向——2027-03 决策）

> **决策**：全面推进弹窗命令式。方案 A（显式 portal(null)）与方案 B（保留 hole 槽）
> 均已实证问题更多——根因相同：**声明式浮层的内容构建（renderFn）与渲染生命周期
> （open/close）耦合在主树机制里**。命令式内核将两者彻底解耦。

## 1. 动机（本轮 bug 根源归档）

portal 独立通道改造踩过的坑，全部源于同一根因：

| 坑 | 根因 |
| --- | --- |
| Command/Menubar/Toast 残留（3 坑） | 关闭路径依赖组件显式 `portal(null)`——纪律风险 |
| NavMenu `applierSame: false`（渲染中断） | renderPortal 的 then 链守卫误判——hook 状态在多 usePopup 场景被覆盖 |
| 容器过滤 EventRegistry | 独立 applier 的 id 与主树同路径——onRemove 误触发 |
| hook 状态化（Toast 状态不持久） | renderFn 调用的 usePopup 闭包状态每次重建 |
| portal() 返回 null 的槽位语义 | 组件输出结构被迫含 portal 调用（A/B 都是） |

**命令式内核**：内容在**调用点**（renderFn 的 sync 调用）构建 → 内核独立渲染 →
主树零输出——**无 Portal vnode、无槽位、无关闭路径依赖**。

## 2. 目标架构（2027-03 修订——**一个形态**：纯命令式）

> **决策修订**：保留一个形态——`ctx.popup.open(opts)`（toast 同款命令式）——
> usePopup hook 形态删除——组件内部也用同一 API（句柄管理样板）。

```
ctx.popup.open(opts): PopupHandle      // 唯一形态（toast 心智）
  opts: { content, anchor?, placement?, center?, gap?, mask?, presence?,
          trapFocus?, lockScroll?, closeOnOutside?, closeOnEscape?, onClose? }
  handle: { close(), update(content), get open() }

组件内部（受控/触发同步样板 ~10 行）：
  let handle: PopupHandle | null = null
  syncPopup(props) {
    if (props.open && !handle)  handle = ctx.popup.open({...})
    else if (!props.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(panelVn(props))
  }
  env.onUnmount(() => handle?.close())

内核（popup-manager）：
  每次 openPopup = 独立实例（无 hook 状态——无共享冲突）
  挂载：容器 + applier + renderToStream → apply（异步——版本号守卫）
  定位：锚定 rect + 视口夹紧（复用 computePos）
  交互：外部点击/Escape 监听（per-instance——close 时移除）
  关闭：presence（exit 动画）→ dispose（applier + 容器 + 监听）
```

**关键差异 vs 现状**：
- `usePopup`/`portal()` 全部删除（组件无输出槽/游离调用/样板 hook）
- 每次 openPopup 独立实例（**无 hook 状态冲突**——NavMenu 类问题根治）
- 引擎删除 Portal vnode case（build/diff/children 的 portal 分支、createPortal、容器过滤）

## 3. 组件改造模式（3 类）

### 模式 I：锚定浮层（Tooltip/Popover/Dropdown/Select/DatePicker 等 ~20 个）

```tsx
const Tooltip = (initProps, ctx) => {
  let anchorEl: HTMLElement | null = null
  let handle: PopupHandle | null = null
  // 句柄同步（受控/内容更新——每次 renderFn 调用）
  const syncPopup = (props) => {
    if (props.open && !handle)
      handle = ctx.popup.open({
        anchor: () => anchorEl,
        placement: 'top',
        content: () => h('div', { class: 'wf-tooltip' }, props.content),
        onClose: () => { handle = null; ctx.ui.render() },
      })
    else if (!props.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(h('div', { class: 'wf-tooltip' }, props.content))
  }
  env.onUnmount(() => { if (handle) handle.close() })
  return (props) => {
    syncPopup(props)
    return h('span', {
      ref: (el) => { anchorEl = el },
      onMouseEnter: () => { if (!props.open) { ...; ctx.ui.render() } },
      onMouseLeave: ...,
    }, props.children)
  }
}
```

### 模式 II：会话级模态（Modal/Drawer/Command/ActionSheet/Tour ~6 个）

```tsx
const Modal = (initProps, ctx) => {
  let handle: PopupHandle | null = null
  return (props) => {
    if (props.open && !handle)
      handle = ctx.popup.open({
        content: () => h('div', { class: 'wf-modal' }, props.children),
        presence: true, trapFocus: true, lockScroll: true,
        onClose: () => { handle = null; props.onOpenChange?.(false) },
      })
    else if (!props.open && handle) { handle.close(); handle = null }
    return null   // 主树零输出
  }
}
```

### 模式 III：命令式函数（toast/notification/confirm/command——已是——统一内核）

```tsx
ctx.toast('成功') → 内核 openPopup({ content, placement }) → handle.close()
```
不依赖组件——现有实现保留——重构到同一内核（可选，非阻塞）。

## 4. 阶段划分

| 阶段 | 内容 | 验证 |
| --- | --- | --- |
| **P1 内核** | popup-manager.ts：`openPopup(opts)` 命令式内核（独立实例/版本守卫/定位/交互/presence）+ `ctx.popup.open` 接线 | 契约（调度语义） |
| **P2 组件迁移批 1**（简单锚定） | Tooltip/Popover/Popconfirm/HoverCard/Slider/Chart/Img/Menu/ContextMenu/Dropdown | 每组件测试绿 |
| **P3 组件迁移批 2**（表单浮层） | Select/AutoComplete/Cascader/TreeSelect/DatePicker/Mentions | 每组件测试绿 |
| **P4 组件迁移批 3**（导航/模态） | Menubar/NavMenu/Modal/Drawer/Command/ActionSheet/Tour/Editor/Notification/SheetGrid/SlideCanvas/toast/confirm | 每组件测试绿 |
| **P5 引擎删机制** | 删除 usePopup/portal()/Portal vnode case/容器过滤/renderPortal | 契约更新 + 全量 |
| **P6 全量回归 + 归档** | 全量 4 轨（契约/场景/showcase/tsc）+ 位置断言 + AGENTS.md | 全绿 |

**顺序要点**：P1 双形态（openPopup 新 + usePopup 兼容）→ 组件逐批迁移（每批验证）→
全部迁移完成后 P5 删引擎机制（杜绝半迁移状态）。

## 5. 风险与验证

- **渲染异步**：renderToStream await 组件工厂——sync 同步调度——版本号守卫丢弃过时渲染（部分应用由下次 diff 自愈）
- **presence 退场**：open false 时 exit 阶段仍渲染——sync 返回 phase（组件读分支）——animationend → closed → dispose
- **定位**：sync 的 anchor getter 每次读最新（替代 el 选项）——refresh 时机不变
- **契约测试**：sync 调度语义（open 变化 → 命令流）node 直跑断言——**禁 mock 网络层**
- **场景测试**：28 浮层交互场景（hover/click/Escape/外部点击/位置）playwright 断言——**每组件迁移后对应测试全绿**

## 6. 长期收益（验收标准）

- 引擎零 portal 机制（Portal vnode/独立通道/容器过滤/关闭路径——全部删除）
- 组件输出纯业务（无槽无游离调用——用户可推导性 §4.0 恢复）
- 浮层生命周期自管理（内核唯一权威——零遗漏/零残留）
- 新浮层组件模式统一（sync 三行——不学 portal 机制）
