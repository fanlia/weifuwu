# 组件编写标准（强制）

> 本文是 weifuwu 组件的**强制标准**——不是建议。每条标准标注强制执行机制：
> **L1 类型强制**（编译期失败）/ **L2 运行时检测**（dev error/warn——写错即报）/
> **L3 契约测试**（引擎行为——vdom-x.test.ts 验收）/ **文档红线**（引擎无法检测——靠审查）。
> 配套：[自定义组件指南](custom-component.md)（流程）· [质量标准](quality.md)（质量）

---

## S1 组件形态

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S1.1 | 两阶段签名 `Component<P, C>`——外层 mount 一次，内层 renderFn 每次渲染 | **L1** | 编译失败（类型） |
| S1.2 | **render-only**：改状态后显式 `ctx.render()`——无自动渲染 | 文档红线 | 交互不更新（审查/测试抓） |
| S1.3 | renderFn 的 await 只允许 `ctx.data`（管道保证 resolve） | 文档红线 | 挂起（永不 resolve） |
| S1.4 | 工厂（mount）内禁止副作用/昂贵操作——数据走 `ctx.data` | 文档红线 | 重复执行（N 实例 = N 次） |

## S2 children 结构（值域协议）

**children 只接受四类值**：vnode / 数组（隐式 Fragment——任意嵌套递归展开）/
string·number（文本）/ 空洞（`false`·`null`·`undefined`·`true`——占位不渲染）。

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S2.1 | children 值域协议（对象/函数/Symbol = 非法输入） | **L2** | `console.warn` + 诊断占位 |
| S2.2 | 数组 = 隐式 Fragment（嵌套递归展开——路径稳定） | **L3** | 契约测试 X-B5 |
| S2.3 | 条件渲染：三元优先（`cond ? <X/> : null`）；`cond && <X/>` 的 cond 保证 boolean | 文档红线 | `0 && <X/>` 渲染 "0" |
| S2.4 | **禁 `x || <Fallback/>`**（0/''/NaN 脏值泄漏）——用 `x != null ? ... : null` | 文档红线 | 渲染 "0"/空文本 |
| S2.5 | **children 数组禁 `filter(Boolean)`**——占位法已处理空洞（长度恒定保位置） | **L2** | A 级检测 dev error |
| S2.6 | 条件渲染的 false 是占位（同构——不塌缩兄弟） | **L3** | 契约测试 X-B4 |

## S3 列表

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S3.1 | **有状态组件实例列表必须显式 key**（业务身份——增删/重排状态跟随） | **L2** | A 级检测 dev error（长度变化 + 无 key 组件项——portal 槽豁免） |
| S3.2 | 无内部状态元素列表无 key（位置身份——patch 正确） | 文档红线 | 状态错位（误加 key 噪音） |
| S3.3 | keyed 项路径 `.k{key}` 稳定（单 keyed 项不翻转） | **L3** | 契约测试 X-B3 |

## S4 状态与受控

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S4.1 | **受控 props 必须配回调**（active/value/checkedKeys 等——父独占状态，回调是唯一出口） | **L2** | `console.warn`（按 name 幂等） |
| S4.2 | 受控输入用 `ctx.ui.useControlledInput`（输入态不依赖受控 value 回流——防焦点丢失） | 文档红线 | 输入失焦 |
| S4.3 | 共享状态 `createStore` + `ctx.ui.useExternal` | 文档红线 | — |
| S4.4 | 内部状态闭包 `let` + 显式 render（不触发渲染的缓存用 let 不 render） | 文档红线 | — |
| S4.5 | **props 里的对象变更必须换引用**（不可变更新——`[...items, x]` 而非 `items.push(x)`）——剪枝是引用比较——同引用内容变化永远不触发重渲染（deepFreeze 豁免对象——含函数属性——不被冻结） | 文档红线 | 内容变了 UI 不更新 |

## S5 浮层

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S5.1 | **浮层唯一入口 `ctx.ui.usePopup`**——createPortal 已内化（内部机制） | **L3** + 文档红线 | 契约 X-C1~C3 |
| S5.2 | 浮层根 `position: fixed` + JS 坐标 + `#__wf_portal`（禁 absolute 相对父容器） | 文档红线 | overflow/transform 裁剪 |
| S5.3 | 新弹层组件先查 usePopup 能力（定位/Escape/外部点击/presence/mask） | 文档红线 | 重复造轮子 |

## S6 生命周期

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S6.1 | **ref 定义在 mount 作用域**（内联 ref 每渲染新函数 → 旧 ref(null) 反复触发清理） | 文档红线 | 清理逻辑反复执行 |
| S6.2 | 卸载清理：`onUnmount`（退订/清定时器/removeEventListener） | **L3** | 契约 X-G1 |
| S6.3 | 浏览器能力走 `ctx.browser`（禁裸 `window.`/`document.`/`localStorage` 等） | 审计基线 | grep 审计（CI 噪音） |

## S7 环境

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S7.1 | 工厂层取数走 `ctx.data`（三场景：SSR 收集/hydration 种子/SPA fetch + 并发合并） | **L3** | 契约 X-A5/X-G3 |
| S7.2 | 个性化/会话数据不进 ctx.data（SSR 序列化泄漏）——留客户端 let + fetch | 文档红线 | 数据泄露 |

---

## S8 路由与 SSR（引擎标准——每个 vdom 必须实现——vdom-x 验收）

| # | 标准 | 强制 | 违反时 |
|---|------|------|--------|
| S8.1 | **UIRouter**：`get(path, handler)` / `notFound`——Trie 匹配（静态段优先参数段优先通配段——`:id` 参数 + `*` 通配）——类比后端 Router | **L3** | 契约 X-R1 |
| S8.2 | **uiServe**（客户端）：SSR 首帧收养（hydrate——路径 id 精确吸收零重建）+ 导航（navigate/链接拦截/popstate） | **L3** | 契约 X-R2/X-R3 |
| S8.3 | **uiSsr**（服务端）：match → 页面 → SSR HTML + 数据种子——同一 UIRouter 实例两端共享（匹配/参数同源） | **L3** | 契约 X-R3 |
| S8.4 | 导航渲染：根级异类型 = 整树原子替换；同类型（params 变化）= 实例复用 | **L3** | 契约 X-R2 |
| S8.5 | 页面组件 ctx.route（path/params——共享可变对象——导航更新内容引用恒定） | 文档红线 | 复用组件读旧 params |

> **引擎兼容契约**：UIRouter/uiServe/uiSsr 是每个 vdom 的**必选项**（公共面
> `weifuwu/ui-dom` 导出——vdom5 替换实现即切换——X-R1~R3 验收）。
> **vdom3 退役条件**：vdom4 通过全部 vdom-x 契约（含 X-R）→ vdom3 删除
> （组件库测试引擎切换 + 公共面去 v3 导出——见 design/vdom4-risk.md）。

## 强制执行机制总览

| 机制 | 覆盖 | 位置 |
|------|------|------|
| **L1 类型** | S1.1 | `Component`/`RenderFn` 类型（contracts/vnode.ts） |
| **L2 运行时检测** | S2.1/S2.5/S3.1/S4.1 | vdom4 diff.ts（A 级检测/非法输入/受控 warn——幂等） |
| **L3 契约测试** | S2.2/S2.6/S3.3/S5.1/S6.2/S7.1 | `src/test/vdom-x.test.ts`（41 测试——vdom5 验收） |
| **审计测试** | L2 检测自身工作 | `src/test/component-standards.test.ts` |
| **审计基线** | S6.3 | `grep -rnE '\bwindow\.|document\.' src/components/`（0 允许） |

## 开发流程（强制）

1. 写组件 → 类型检查（L1 编译期）
2. dev 运行 → L2 检测报错即修（受控缺回调/key 缺失/非法 children/filter）
3. 提测 → 契约测试（L3——引擎行为）
4. 发布 → 全量（1538+）

## 与引擎的契约（vdom5 必须满足）

vdom-x.test.ts 的 41 测试 = 上述 L3 条目的可执行化。新引擎一行替换入口——
全绿 = 组件库零改动迁移 + 标准自动满足。
