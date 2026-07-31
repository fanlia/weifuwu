# Changelog

## 0.54.0 (弹层坐标跟随 + 全局反馈中间件)

### ✨ New APIs

- `ctx.ui.usePopupPosition(opts)`：弹层坐标跟随——Popover/Tooltip/Dropdown/DatePicker/Chart 的弹出层在页面滚动、嵌套容器滚动、窗口缩放后自动重算 fixed 坐标。全局单例 scroll(capture)/resize 监听 + rAF 节流，按组件 selfId 精准刷新
- `ctx.confirm()`（移入 components）：命令式确认对话框，返回 `Promise<boolean>`，组件化渲染（Modal + portal + 焦点陷阱 + i18n），多次调用叠放互不干扰
- `<Confirm>` 声明式组件：基于 Modal 封装，footer 自带取消/确定
- `ctx.toast()`：命令式消息提示，任意代码可调（组件/拦截器/WS/定时器），自动消失 / 单条 duration 覆盖 / max 限制

### 🔧 Breaking Changes

- `confirm` 从 `weifuwu/client` 移到 `weifuwu/components`：`import { confirm } from 'weifuwu/components'`

### 🚀 Features

- Confirm 由「直接 DOM + 内联样式」改为组件化渲染，主题可定制（`.wf-modal` 系列），与 Modal 视觉/行为统一
- Toast/Confirm 归位组件库，`weifuwu/components` 共 42 个组件 + 2 个命令式中间件

### 🐛 Fixes

- 修复 mountVNode 路径组件首次渲染 null 时 `_refNode` 为空导致 scope render 无法定位
- demo apps 源码修复（apps/demo 误提交压缩产物恢复、agent-platform 括号作用域错位）
- 严格模式 9 个 TypeScript 类型错误（JSX `key`/Input `name`/Skeleton `cols`/ref 类型）

### ✅ 测试

- 611 个测试全过（新增 usePopupPosition 10 + Confirm 13 + toast 9 + $ 深度 Proxy 等）

## 0.53.0 (VDOM 三态 skip + keyed diff)

### 🚀 Features

- 三态 skip：props 没变 + `$` 没脏 + ctx 版本一致 → 跳过整个子树渲染（零 `_render` 调用、零 `patchValue` 遍历）
- lastIndex keyed diff（React 同款），顺序不变时零 `insertBefore`，DemoButton 点击 DOM 修改 34 → 1
- Portal null ↔ 内容切换的 DOM 清理修复；`ctx.ui.$()` 单例缓存（同组件实例返回同一 Proxy）

## 0.52.0 (响应式自适应组件)

### ✨ New APIs

- `ctx.ui.useMedia(query, cb)`：响应式媒体查询，断点变化自动回调
- `ctx.ui.useBreakpoint(cb \| bps, cb?)`：命名断点 mobile/tablet/desktop + 自定义断点
- VDOM 子节点 diff 始终 keyed 模式，无 key 自动分配位置 key

## 0.51.0 (组件级范围渲染)

### ✨ New APIs

- `ctx.ui.selfId(name)`：组件注册自定义 ID，同名冲突抛错
- `ctx.ui.render(['id'])`：按 ID 精准刷新指定组件
- `ctx.ui.dirty(['id'])`：异步版本同上

### 🔧 Breaking Changes

- `ctx.ui.render()` 默认从「刷新整个 VDOM」改为「刷新当前组件」
- `ctx.ui.dirty()` 同理，作用域缩为当前组件
- `ctx.ui.$().x = val` 只触发所属组件渲染，不波及兄弟

### 🚀 Features

- 组件级范围渲染：每个组件实例唯一 `_id`，通过 `idRegistry` 全局注册表可查找
- `render()` / `dirty()` / `$` 三套 API 统一 scope 机制
- 首次渲染后自动设置子组件 DOM 锚点（`_parentNode` / `_refNode`）
- 手动/自动同层共存：组件库手动优先，业务层自动优先
- 全部 472 个测试通过，42 个 components 零修改

## 0.50.0 (VDOM 引擎 + 组件优化)

### ✨ New APIs

- `ref` prop：原生元素 DOM 引用，`ref(el)` 初始化 / `ref(null)` 清理

### 🔧 Breaking Changes

- 移除 `ctx.ui.onmount/onmounted/onunmount/onupdate`：
  - `onmount` → mount 外层函数直接写
  - `onmounted` → `ref` 的 `if (el)` 分支
  - `onunmount` → `ref` 的 `else` 分支
  - `onupdate` → render 内层函数收新 props
- `ref` 不再接受返回值，清理统一走 `ref(null)`
- 移除 VNode `_$` 和 `_cleanup` 内部字段

### 🚀 Features

- Form 验证规则：required / pattern / minLength / maxLength / validator
- Table 排序：sortable / sorter / sortKey / sortOrder / onSort + emptyText
- Toast 位置（5 方向）/ duration / max 数量限制
- Select searchable 搜索过滤 + onSearch 异步搜索
- Modal width / closable 控制
- Skeleton 新增 image / avatar / table 变体
- Tooltip / Popover / Dropdown 入场动画（fade / scale / slide）

### 🐛 Bug Fixes

- Editor 图片按钮导致内容重复（children 索引漂移修复）
- Editor 图片/表格/链接不跟随光标（选区保存恢复机制）
- Editor ref 无效（VDOM ref prop 实现）
- DatePicker/Dropdown 弹出框位置跳跃（DOM 引用过期）
- Popover 弹窗位置偏移（缺少 position CSS class）
- Modal/Drawer trapFocus 因 Portal 文本占位符崩溃
- Drawer 缺少 ESC 键盘关闭
- Portal 组件 onmounted 收到 TextNode 而非实际 DOM

### 🧹 Chores

- 前端 API 从 7 个精简到 3 个：render / dirty / $
- VNode 内部字段从 9 个精简到 6 个
- 测试 473 → 466（移除生命周期测试，新增 ref 测试）
- render.ts 从 ~680 行精简到 ~620 行

## 0.33.8 (Sprint 1-11 — weifuwu/client DX overhaul)

### ✨ New APIs

- **`reactiveArray()`** — 响应式数组，提供 push/pop/shift/unshift/remove/replace/clear/sort/reverse 等方法
- **`useModel()`** — 表单双向绑定，一行代码绑定 signal 到 input/checkbox/select
- **`createResource()`** — 异步数据资源，自动管理 loading/error/data 三态
- **`untrack()`** — 在 effect 中读取 signal 但不建立依赖
- **`batch()`** — 合并多个 signal 写入为一次通知
- **`createContext()`** — 类型安全的 provide/inject 工厂
- **`createStyles()`** — 组件级作用域 CSS
- **`Transition`** — CSS 动画进入/离开组件
- **`Link`** — SPA 路由导航组件（支持右键新标签页）
- **`enableDevtools()`** — 开发警告 + 浏览器控制台 signal 检查器

### 🚀 Enhancements

- **createResource 重试 + 超时** — `retry: N` / `timeout: ms` 选项
- **ErrorBoundary onError** — 错误发生时回调（日志上报）
- **RouteView 路由过渡** — `opts.transition` 配置页面切换动画
- **useForm validateOnInit** — 创建时即运行全部验证
- **LoginForm / Chat 纯 JSX 重写** — 移除 h() 辅助函数，为最佳实践
- **`signal.mutate()`** — 原地修改对象/数组并触发通知
- **computed 初始值修复** — 类型安全的初始值计算

### 🐛 Bug Fixes

- **RouteView 查询参数不更新** — 添加 query 比对，路径不变 query 变时重新渲染
- **Show/For 响应式更新失效** — DocumentFragment → `display:contents` 架构
- **effect 内存泄漏** — 所有 DOM 绑定 effect 注册到元素生命周期，卸载自动 dispose
- **Show/For 子元素 effect 泄漏** — 重建时旧子元素的 effect 正确清理
- **Chat 组件 For 传值 bug** — 传递 Signal 而非普通数组

### 🧪 Testing

- **47 个单元测试** — 覆盖 signal/effect/computed/Show/For/useForm/createResource
- **10 个性能基准测试** — Signal 创建/读写/通知/Computed/JSX 渲染吞吐量

### 📚 Documentation

- **纯前端 Quick Start** — 无需后端即可体验 weifuwu/client
- **React 迁移指南** — `useState→signal`, `useEffect→effect`, `useMemo→computed` 对照表
- **完整 JSDoc** — 所有导出函数有中文文档
- **VSCode 代码片段** — 17 个常用模式（signal/effect/Show/For/Transition 等）

### 性能基线

| 操作 | 吞吐量 |
|------|--------|
| Signal 创建 | ~10,000 ops/ms |
| Signal 读写 | ~9,600 ops/ms |
| 通知 10,000 effect | ~2,600 ops/ms |
| batch 合并 10,000 次写入 | ~0.6ms |
| JSX div 创建 | ~200 ops/ms |
| For 渲染 10,000 项 | ~109 ops/ms |
