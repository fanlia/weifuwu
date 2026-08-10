# 组件统一计划：asyncComponent → 原生 async 组件

> **状态（2026-10）**：✅ 已实施并收尾。`asyncComponent` 装饰器已下沉为渲染器对 async 组件函数的原生支持（`返回值 instanceof Promise` 判别），签名统一 `(initProps, ctx)`；`ctx.data.get()` 三场景不变。占位信号 = `Placeholder`（可选 `<Suspense fallback>` 边界显示 loading）。**后续（2026-10）`asyncComponent` 兼容层已彻底移除**（见提交"移除 asyncComponent"）——渲染器只保留原生 async 组件路径（vnode 级 `_asyncDef` 按实例缓存），`isAsyncComponent`/`ASYNC_MARK`/WeakMap 全局缓存全部删除。
>
> 背景讨论见会话记录：统一后「少一套签名、initProps 可用、缓存语义自动正确」；代价是工厂默认按实例执行（数据走 ctx.data 则零成本）。

## 现状盘点（已核实）

| # | 事实 | 位置 |
|---|------|------|
| C1 | `asyncComponent(f)` **只是打标** `__wfAsyncComponent`，无任何逻辑 | `src/ui-dom/vnode.ts:98-104` |
| C2 | 渲染器靠 `isAsyncComponent` 判别，**两套调用约定**：`Component(initProps, ctx)` vs `AsyncComponent(ctx)` | `render.ts:164`、`ssr.ts:216`、`ui/ssr.ts:197`、`registry.ts:9` |
| C3 | 工厂缓存 `WeakMap<AsyncComponent, FactoryEntry>`——**全局只执行一次**（同组件所有实例共享） | `registry.ts:24,59-92` |
| C4 | 客户端 async 未解析 → 占位 null + `startAsyncFactory` + resolve 后 `scheduleFullReRender` | `render.ts:164-175` |
| C5 | SSR 直接 `await type(ctx)`，**不缓存工厂定义**（数据 per-request，dataStore 去重） | `ssr.ts:216-224`、`ui/ssr.ts:197` |
| C6 | `ctx.data.get()` 三场景已自动适配，与 asyncComponent **解耦**（数据管道自身能力） | `serve.ts:76`、`ssr.ts:181` |
| C7 | `diff.ts:157` 已有 `_render` 未传递 fallback（"首次挂载——支持 async 工厂"） | `diff.ts:154-157` |
| C8 | 仓库 apps/ + src/components/ 中 asyncComponent **用量 0**；测试样本 8 处（ssr-page×3 + ssr×5） | grep 核实 |
| C9 | 渲染器代码只有 ui-dom 一份（client/ 已并入）；**改框架必须 rebuild dist** | build.mjs externalize ui-dom |

## 问题清单（统一动机）

| # | 症状 | 根因 |
|---|------|------|
| U1 | async 工厂**拿不到 initProps**（签名 `(ctx)`）——props 驱动的取数写不了 | C2 的签名特例 |
| U2 | 用户必须记 `asyncComponent` 包装 + 工厂/组件两套签名 | C1/C2 |
| U3 | 全局工厂缓存与 initProps 天然冲突：`<Card url="/a"/>` 与 `/b` 共用工厂结果 | C3 |
| U4 | SSR 遍历器有特例注释"服务端不缓存工厂定义"——为绕全局缓存 | C5 |
| U5 | 渲染器判别靠**打标**而非返回值本质（函数加了标记才算 async） | C2 |

## 目标形态

```tsx
// 同步组件（不变）：
const Sync = (_init, ctx) => (props) => <h1>{props.x}</h1>

// 异步组件（统一后，唯一差别是 async 关键字）：
const Home = async (initProps, ctx) => {
  const msg = await ctx.data.get('/api/hello')   // 三场景自动：SSR→__DATA__ / hydration 种子 / SPA fetch
  return (props) => <h1>{msg.msg}</h1>
}
```

渲染器规则收敛为一条：**`Comp(props, ctx)` 返回值是 Promise → 异步路径（占位 + resolve 补全）；否则同步路径（现状不变）**。

## 关键技术决策

### D1 签名统一
- `AsyncComponent<C, P>` 类型改为 `(initProps: P, ctx) => Promise<Component<P, C> | null>`——与 `Component` 同参同返回（返回值外包 Promise）
- 删除 `ASYNC_MARK` 打标与 `isAsyncComponent`（判别改为运行时 `result instanceof Promise`）

### D2 缓存语义：按实例（默认）+ 保留 asyncComponent（显式全局一次）
- **默认（原生 async 组件）**：工厂结果缓存在**组件实例**（vnode 字段，resolve 后 `_render` 就绪走同步路径）。同组件 N 处实例各执行一次工厂；`ctx.data` 缓存兜底 → 不重复 fetch。
- **代码分割/昂贵一次性资源**：保留 `asyncComponent(factory)`（签名不变 `(ctx) => Promise<Component>`，WeakMap 全局一次）作为**显式声明**。
- **红线**（文档强制）：原生 async 组件工厂只做数据声明（ctx.data），禁止副作用/昂贵操作——重复执行即零成本。

### D3 占位/补全复用现有机制
- 未 resolve → 返回 null（占位）+ `scheduleFullReRender`；resolve 后整树重渲染走 `_render` 同步路径（diff.ts:154 已有 fallback）
- hydration：`ctx.data.get` 命中 `__DATA__` 种子 → 微任务级 resolve → 无可见闪烁（需测试确认）

### D4 SSR 遍历器统一
- `def = await vnode.type(props, ctx)`——await 同步组件立即 resolve，**删除 isAsyncComponent 分支**；"数据 per-request"注释删除（按实例缓存后天然成立）
- `src/ui/ssr.ts` 与 `src/ui-dom/ssr.ts` 两处同步改

## 实施阶段（TDD 先行）

```
阶段 0  基线：全量测试快照（1760 绿），git 分支/提交点
阶段 1  测试先行（红）：新建 src/test/async-component-unify.test.ts
阶段 2  渲染器统一：vnode.ts（类型/删打标）+ render.ts（mountComponent Promise 判别）+ registry.ts（按实例缓存）
阶段 3  SSR 统一：ui-dom/ssr.ts + ui/ssr.ts 遍历器删分支
阶段 4  导出与类型：ui-dom/index.ts 导出调整；AsyncComponent 新签名；JSX ElementType 兼容
阶段 5  兼容验证：asyncComponent 仍可用（显式全局一次）；迁移 8 处旧测试样本（ssr.test.ts/ssr-page.test.ts）
阶段 6  文档：AGENTS.md §3.3 + docs/custom-components.md §5 + docs/frontend.md + README（导入示例）
阶段 7  收尾：全量测试 + rebuild dist + apps 冒烟（agent-browser 验证 SSR 页）→ 发布
```

### 阶段 1 测试清单（红→绿）

| 用例 | 断言 |
|------|------|
| T1 原生 async 组件（无包装）挂载 | 占位 → resolve 后 DOM 补全（含内容） |
| T2 数据来自 ctx.data | SSR 渲染后 `__DATA__` 含数据；客户端 hydration 种子命中不 fetch |
| T3 多实例 initProps 隔离 | `<Card url="/a"/>` 与 `/b` 各得各自数据（工厂按实例执行） |
| T4 工厂执行次数 | N 处实例 = N 次工厂调用；ctx.data fetcher 仍只 1 次（缓存合并） |
| T5 同步组件零感知 | 现有同步组件测试全绿（无回归） |
| T6 SSR await | async 组件 → HTML 完整；嵌套 async 组件 |
| T7 asyncComponent 兼容 | 保留包装：全局一次（WeakMap）+ initProps 不可用（文档声明） |
| T8 `_render` 复用 | resolve 后二次渲染（$ 赋值）走 `_render`，不重跑工厂 |

### 阶段 2-3 改动点

```
src/ui-dom/vnode.ts      AsyncComponent 类型签名；删 ASYNC_MARK/isAsyncComponent（或保留导出为 deprecated）
src/ui-dom/render.ts     mountComponent：result = Comp(props, ctx)；instanceof Promise → 占位/补全
src/ui-dom/registry.ts   startAsyncFactory 改造：按实例入口（vnode 持有）+ 全局入口（asyncComponent 专用）
src/ui-dom/ssr.ts        renderSsr 组件分支：统一 await，删 isAsyncComponent
src/ui/ssr.ts            同左
src/ui-dom/index.ts      导出调整
```

## 兼容与迁移

- **`asyncComponent` 保留**（显式全局一次语义），签名不变——存量代码零破坏
- 旧测试 8 处（ssr.test.ts ×5、ssr-page.test.ts ×3）迁移为原生写法（验证新路径）或保留（验证兼容路径）——各迁一半，双向覆盖
- 文档示例全部更新为原生写法；asyncComponent 降级为"代码分割专用"小节

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| mount 路径回归（刚修完流式 `_refNode`） | 阶段 1 测试先行 + 现有 ui-dom-regression/ui-dom-stream-regression 全绿 |
| 按实例缓存 → 工厂重复执行（若有人绕过红线） | 文档红线 + T4 测试固化"ctx.data fetcher 仍只 1 次" |
| hydration 占位闪烁 | T2 测试 + 微任务时序审查 |
| dist 与 src 双份（框架改动需 rebuild） | 阶段 7 rebuild + agent-browser 冒烟 |

回滚：阶段 2-3 改动集中在 4 个文件（vnode/render/registry/ssr×2），单提交点回滚；asyncComponent 兼容路径保留 = 天然回滚面。

## 验收标准

- [ ] T1-T8 全绿；全量测试（1760+）无回归
- [ ] `tsc --noEmit` 通过；`AsyncComponent` 新签名类型流负例（`@ts-expect-error`）进 type-flow 测试
- [ ] agent-browser 冒烟：SSR 页（__DATA__ 完整）+ 客户端 async 组件补全无闪烁
- [ ] 文档四件套更新（AGENTS.md / custom-components.md / frontend.md / README）
- [ ] rebuild dist + 发布（minor 版本）
