# vdom3 app 节点——多应用加载方案（草案讨论）

> 用户方向 2026-12：新增节点类型 `app`——实现多应用加载（一页挂多个应用——
> 应用作为父树的子树但独立渲染/状态/事件）。
> 关联：优化计划 4.2（per-root 实例化——暂缓）——app 节点是其**具体化入口**。

## 1. 形态

```tsx
// 本地注册（应用注册表）
h('app', { appId: 'billing', props: { userId }, onReady: (h) => ... }, <Skeleton/>)

// 远程加载（动态 import——可裁剪）
h('app', { src: '/apps/billing.js', props: {...} }, <Skeleton/>)
```

- `appId`：注册表查找（应用工厂——模块级注册 `registerApp(id, factory)`）
- children：**加载中占位**（骨架屏——应用就绪前显示）
- `props`：传给子应用（应用根组件接收）

## 2. 渲染机制（核心设计）

```
父树 buildVNode → 遇 app 节点（VKind 'app'）→ 边界
  ├─ 父侧：app 节点是"不透明"的（内容不展开到父树——独立构建）
  └─ 子侧：子应用自己的渲染管线（buildVNode → patch → DOM——per-app 实例）
```

**与现有 VKind 的关系**：

| 维度 | portal | app |
|---|---|---|
| 容器 | 同应用（#__wf_portal——共享引擎） | **独立应用**（per-app stream/delegate/registry） |
| 渲染 | 同树展开（children 进远程容器） | **独立树**（子应用自建根） |
| 事件 | 冒泡到 portal 容器（同 delegate） | **独立 delegate**（子应用监听不混合） |
| 状态 | 同流 | **独立 stream**（子流——父流只见边界事件） |

**classifyKind 扩展**：`'app'` 加入 VKind——`h('app', ...)` 的 type 是 Symbol（`App`——类似 Portal）——渲染分支：

```ts
function patchAppKind(ov, vn, parent, anchor): Node {
  // 子应用挂载点（app 节点对应的 DOM 容器——父树中的占位元素）
  // 子应用 createRoot 到该容器（per-app 实例）——独立渲染
  // 更新：props 变化 → 通知子应用（子应用根组件 props 更新——独立更新链）
}
```

## 3. 隔离设计（关键决策）

**per-app 实例**（4.2 的具体化）：
- **stream**：子应用独立事件流（`createEventStream`）——子应用内部事件不混入父流
- **delegate**：子应用独立注册表 + 挂载点（子应用 root 容器）——监听不混合
- **registry/id**：子应用独立 id 分配器（`nextNodeId` per-app）——id 隔离
- **组件索引**（comp-index）：per-app——子应用组件 O(1) 定位独立

**边界事件（父流可见——app 节点生命周期）**：
```
app:mount（子应用挂载完成——ready）
app:unmount（子应用销毁）
app:error（子应用加载/运行失败——error:app）
app:update（props 变化——通知子应用）
```

**隔离范围（诚实裁剪）**：
- **同 realm**（非 iframe）——共享 JS 运行时（模块/组件库同一实例——状态共享的前提是"模块单例"——**AGENTS.md §6.1**：子应用组件库与父共享同一模块实例——不隔离 JS 堆）
- **样式**：不隔离（全局 CSS——组件库 token 共享）——Shadow DOM 裁剪（可后续）
- **DOM**：隔离（子应用 DOM 在其容器内——父 patch 不触碰）

## 4. 生命周期

| 阶段 | 事件 | 行为 |
|---|---|---|
| 挂载 | `app:mount` | 应用工厂调用（可 await 初始化）→ 子应用 createRoot（per-app 实例）→ children 占位替换 |
| 更新 | `app:update` | props 变化 → 子应用根组件 props 更新（子应用组件级更新——独立链） |
| 卸载 | `app:unmount` | 子应用 unmount（独立清理——监听/索引/事件流）→ 占位恢复 |
| 错误 | `app:error` | 加载失败/运行异常 → 错误事件（error:app——phase: 'app'）→ 降级（占位/错误 UI——裁剪） |

## 5. 事件流（两层）

```
父流：route:change → ... → app:mount → app:update → app:unmount（边界——应用级）
子流：comp:render → vnode:patch → node:create ...（子应用内部——完整独立）
```

- 父应用可观测"子应用何时挂载/更新/卸载/出错"（app:* 边界事件）
- 子应用内部全链路（comp/node/text/event/error）——**独立可调试**（子流订阅）
- 跨应用调试：父流 app:mount + 子流（切换订阅）——两层心智清晰

## 6. 注册表（本地注册模式）

```ts
// 模块级应用注册表
registerApp('billing', (el, props, ctx) => createRoot(h(BillingApp, { props }), el, { ctx }))
// 或简单工厂：async (props) => Component（应用根组件）
```

- `appId` 查注册表 → 工厂 → 挂载
- 未注册 → `app:error`（unknown-app）+ 占位

## 7. 关键决策（讨论点）

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| D1 | 加载方式 | 本地注册（appId）vs 远程（src） | **本地注册先行**（远程 = 动态 import——可后续） |
| D2 | 隔离级别 | 全隔离（per-app stream/delegate/id）vs 共享父流 | **全隔离**（app 的意义）——边界事件在父流 |
| D3 | 子应用渲染 | createRoot（独立根）vs 共享 build 管线 | **createRoot**（per-app 实例——独立 update 链） |
| D4 | props 更新 | 父 build 时比较 → app:update → 子应用更新 | 父不深渲染子应用（不透明）——props 桥接 |
| D5 | 占位 | children（骨架屏）在应用就绪前显示 | 是（loading 语义——与 uiServe loading 对齐） |
| D6 | 样式 | 全局共享（不隔离） | 是（裁剪 Shadow DOM——组件库 token 共享） |

## 8. 实施步骤（讨论后）

1. types.ts：`App` Symbol + VKind 'app' + classifyKind
2. jsx.ts：`createApp`（h('app') 的构造——或直接 type: App）
3. registerApp/registry（应用注册表）
4. render.ts：app 节点渲染（挂载/更新/卸载——per-app createRoot）
5. 事件流：app:mount/update/unmount/error（父流边界）
6. per-app 实例化：stream/delegate/id/comp-index（createRoot options 注入——4.2 落地）
7. 测试：多应用隔离（事件流独立/监听独立/id 独立）+ 边界事件 + 卸载清理
8. 浏览器验证：父应用嵌子应用（计数器/弹层互不干扰）

## 9. 风险

| 风险 | 缓解 |
|---|---|
| per-app id 冲突 | 独立 id 分配器（app 前缀或独立计数器） |
| 子应用卸载泄漏 | unmount 全量清理（stream/delegate/索引/监听——现有机制 per-app 化） |
| 父 patch 触碰子应用 DOM | app 节点不透明（父只管理占位容器——子应用 DOM 不展开） |
| 组件库双实例（§6.1） | 同 realm 共享模块单例（不隔离 JS 堆——文档明确） |
| 嵌套 app（app 内 app） | 递归支持（子应用内再 createRoot——自然） |

## 10. 非目标（诚实裁剪）

- 不做 iframe 级隔离（安全沙箱）——app 是"渲染/状态/事件隔离"（同 realm）
- 不做远程加载先行（本地注册——动态 import 后续）
- 不做样式隔离（Shadow DOM）——组件库 token 全局共享
- 不做应用间通信框架（props 桥接 + 边界事件——应用间用事件流/自定义通道）
