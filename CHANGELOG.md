# Changelog

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
