# vdom3 架构定稿（2026-08——vnode + stream 引擎）

> 全新前端引擎（与 vdom2 并行，不兼容演进）：**渲染执行 = 事件流**。
> 本文固化架构决策、核心不变量、模块设计、关键教训、验证矩阵与未来方向。

## 1. 架构概述

```
vdom2：状态 → renderFn → vnode 树 → 整树 diff（命令式比较）→ DOM 变更 + 旁路事件记录
vdom3：状态 → renderFn → vnode 树 → 渲染事件流（CREATE/INSERT/UPDATE/REMOVE）
       → 执行器消费事件 → DOM（事件流是引擎本体——DOM = fold(事件流)）
```

**核心不变量**：
1. **vnode 树保留声明式**（renderFn 输出完整树——与 vdom2 同模型，两阶段组件兼容）
2. **渲染即事件**：节点创建/属性设置/文本更新/插入/移除都是事件（可回放/取消/断言）
3. **DOM = fold(事件流)**：初始 DOM + 事件序列 = 任意时刻 DOM（时间旅行）
4. **更新最小化**：同位置同类型（含 key）复用——仅变化发事件（无整树 diff 决策噪音）

## 2. 模块设计

```
src/ui-dom/vdom3/
├── types.ts    — VNode（native/组件/Fragment）+ V3Event（8 种）+ EventStream 契约
├── jsx.ts      — h()（vnode 创建——单数组参数自动展开）
├── build.ts    — 异步组件构建（COMP_MOUNT 事件；oldV 对照复用 _render——工厂不重跑；
│                  ctx.onUnmount 钩子注册表）
├── render.ts   — mount/patch（同位置同类型复用 → 事件流 → DOM；REMOVE 存快照）
├── scheduler.ts— 同 tick 合并（微任务 flush）/ 补跑 / 循环上限截断（防死循环）
├── registry.ts — NodeRegistry（id↔Node 双向——文本 WeakMap；REMOVE 快照供 undo）
├── replay.ts   — replay（事件流 → DOM 重建）/ undo（逆操作）/ 事件序列断言
├── router.ts   — ROUTE_CHANGE 事件 → 匹配（:param）→ 页面挂载（全链路）
├── root.ts     — createRoot（组件 ctx.render 调度；update 串行 + dirty 合并）
├── events.ts   — 事件流（记录/逆操作/容量保护）
└── ssr.ts      — renderToEvents（dry-run 事件流生成——服务端）+ 序列化传输
```

## 3. 事件流覆盖（location → DOM 全链路）

```
ROUTE_CHANGE(path, params) → COMP_MOUNT(页面) → NODE_CREATE/TEXT_CREATE
→ PROP_UPDATE → INSERT → (更新时) TEXT_UPDATE/REMOVE/MOVE → COMP_UNMOUNT
```

8 种事件类型（浏览器实测全集）：
`ROUTE_CHANGE / COMP_MOUNT / COMP_UNMOUNT / NODE_CREATE / PROP_UPDATE / INSERT / TEXT_CREATE / REMOVE`

## 4. 关键决策与教训（真实事故驱动）

| 决策 | 事故/动机 | 方案 |
|------|----------|------|
| **update 串行 + dirty 合并** | 同 tick 多变更 → 两次 async update 并发基于初始树 patch → childNodes 索引错位 → 结构灾难（列表丢失） | `updating` 标记 + `dirty` 合并（渲染中触发标记、完成后补跑一次） |
| **事件绑定 `__v3evt` 单次** | createNode 未设标记 → patchProps 每次重复绑定 onClick → 点击触发多次（count/列表错乱） | 创建与 patch 统一 `__v3evt` 检查 |
| **scheduler 循环上限** | vdom2 pending 死循环教训（前车之鉴） | MAX_ITERATIONS 截断 + 报错 |
| **NodeRegistry 文本 WeakMap** | 文本节点无 data-v3-id → 事件流 id 丢失 → replay 无法定位 | WeakMap 双向映射 |
| **jsdom id 缓存怪癖** | 动态 setAttribute('id') 后 querySelector('#id') 失效 | 测试用属性选择器 `[id="x"]` |

## 5. 验证矩阵（22 场景 + 浏览器 + SSR）

| 层 | 验证 |
|----|------|
| 核心渲染 | mount 事件流 / patch 复用（NODE_CREATE=0）/ 异类型重建 / 列表 keyed |
| 组件 | COMP_MOUNT / 复用（factoryRuns=1）/ 卸载 onUnmount 清理 |
| 调度 | 合并 / 补跑 / 死循环截断 / createRoot 重渲染 |
| 事件流 | 回放同构 / undo 恢复 / 事件序列断言 |
| 路由 | navigate 全链路 / :param 解析 |
| 生命周期 | onUnmount 钩子（定时器释放） |
| SSR | 事件流序列化往返 → replay 重建（零 DOM 猜测） |
| 流式渲染 | 服务端逐事件推送 → 客户端逐事件应用（渐进首屏——根挂载即见） |
| 录制转测试 | 事件流 → 自动生成可运行测试（子进程执行通过——事故转回归） |
| 多端同步 | 事件流 = 操作日志 → 镜像容器（增量同步——日志游标） |
| 兼容层 | vdom2 组件（ctx.ui.render）→ vdom3 树运行（迁移路径——hooks 裁剪） |
| MOVE 事件 | keyed 重排 = 移动而非重建（DOM 状态保持 + 回放/undo 可逆） |
| 浏览器 | apps/vdom3-demo：路由/交互/事件流 8 类型/跨路由状态保持/__v3_replay 回放 |
| 性能 | mount 1000 节点 ~35ms（jsdom）/ 流式 ~200 更新/ms |

## 6. 与 vdom2 对比（定位）

| 维度 | vdom2 | vdom3 |
|------|-------|-------|
| 事件流角色 | 观测层（旁路记录） | **执行层（引擎本体）** |
| 更新机制 | 整树 diff（O(树)） | 同位置复用（O(变化量)） |
| 可回放/取消 | ❌ | ✅（DOM = fold） |
| SSR | HTML + hydrate 游标（DOM 猜测） | **事件流重放（零猜测）** |
| 成熟度 | ✅ 生产（16 修复/174 测试/18 页面） | ⚠️ 实验（22 场景/demo） |

## 7. 未来方向

1. ~~**录制转测试工具**~~ ✅ 已完成（record.ts——事件流 → 自动生成可运行测试，闭环验证）
2. ~~**流式渲染**~~ ✅ 已完成（renderToEventStream——服务端逐事件推送 → 客户端 applyEvent 逐事件应用——渐进首屏）
3. **协作/OT 双向**：单向镜像已就绪（sync.ts）——双向 = 各自日志 + 合并策略（MOVE 已可逆）
4. ~~**vdom2 ↔ vdom3 兼容层**~~ ✅ 已完成（compat.ts——ctx.ui.render 适配；hooks 裁剪）
5. **性能**：事件池/批处理（当前 jsdom 环境可接受——真实浏览器更快）
