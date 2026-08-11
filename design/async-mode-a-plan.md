# 模式 A：全 async 组件 + await 全部（骨架屏）实施计划

> 目标：渲染器从「同步遍历 + 占位/补全 + 整树重渲染」演进为「async 构建 + 同步落地」。
> SSR/SPA 遍历器同构，差异收敛到环境层；组件 mount 期可 await（数据/权限/初始化）。
> 配套讨论：design/component-test-infra.md（测试原语）、design/ai-contract.md（协议）。

## 架构定稿

```
两阶段渲染：
  buildVNode(vnode, ctx)   [async]  递归展开组件树：await 工厂 → renderFn → 递归子树
                                    组件节点保留（挂 _render + _child）——dirty 锚点不丢
                                    兄弟组件 Promise.all 并行（父子串行、兄弟并行）
  renderValue(vnode, ctx)  [同步]  已解析树 → DOM（组件节点读 _child，不碰工厂）
  patchValue(...)          [同步]  现有 diff（导航原子切换：旧页保持 → 新树构建完成 → 一次 diff）

运行时：
  首帧/导航：await buildVNode → renderValue / patchValue（骨架屏：预置 HTML 原子替换）
  update（dirty）：renderByIds 同步（_render 已设，不变）
  动态挂载兜底：运行时首次挂载 async 组件 → 占位(null) + 启动工厂 + resolve 后局部 renderByIds([id]) 补全

删除的机制（无占位即无此问题）：
  Placeholder/Suspense 边界（无生产使用点）
  asyncResolved/asyncPending 共享表（multi-async 交错修复代码——问题类别消失）
  scheduleFullReRender（整树重渲染）→ 局部 renderByIds 补全
  serve.ts __scheduleRender 钩子
  diff.ts _asyncDef 传递分支

保留：
  ctx.data（async get + 缓存合并——工厂 await 命中缓存即微任务）
  ctx.browser 三态 shim、hydration（已是 async 遍历器）、renderSsr（已是 async）
  diff 同步原子性（update 路径不动）
```

## 关键设计决策

| 决策 | 理由 |
|------|------|
| 组件节点保留在树上（挂 _child） | `$` dirty 精准刷新（renderByIds）需要 vnode 锚点；工厂只跑一次 |
| buildVNode 数组分支 Promise.all | 兄弟 async 组件并行（工厂"遇到即启动"语义保持，不退化串行） |
| buildVNode 工厂不包 setMounting | 全局 _mounting 在并行构建期会误伤旧树 dirty（导航时旧组件交互被抑制）——renderByIds 的 `!_render` 跳过兜底已足够 |
| 动态挂载兜底 = 占位 + 局部补全 | 运行时 `$.show` 切出的 async 组件无法预构建；局部 renderByIds 替代整树重渲染 |
| 占位 = null（删 Placeholder 组件） | 无 Suspense 边界后 fallback 无消费者；null 占位 + patchValue null→内容 插入已有逻辑支持 |
| renderVNode 升级双形态 | 同步组件返回 VNode（零破坏）；async 组件返回 Promise（测试 await）——组件分批 async 化时增量迁移 |

## 阶段划分

- **S0**：里程碑 commit（工作区干净）
- **S1**：渲染器两阶段化（buildVNode + renderValue 改造 + diff 适配 + serve 适配 + 局部补全）
  - S1a: render.ts — mountComponent 局部补全（resolve → renderByIds）+ 删 asyncResolved/asyncPending/scheduleFullReRender
  - S1b: render.ts — 新增 buildVNode；renderValue 组件分支读 _child
  - S1c: diff.ts 删 _asyncDef 传递；vnode.ts 删 Suspense/Placeholder；serve.ts doRender 用 buildVNode + 删 __scheduleRender
  - S1d: 改造 async-component-unify.test.ts（渐进 → await 全部）+ 新增 buildVNode 并行测试
  - S1e: 全量测试 + typecheck + build
- **S2**：骨架屏 API（handle.ready + 原子替换）+ demo 验证 + AGENTS.md/docs 同步
- **S3**（分批，待 S1/S2 验收后）：113 组件 async 化（机械 churn，每批 10-15 + 对应测试 await）
- **S4** ✅：三遍历器合一——提取 `mountAsyncComponent`（共享：id 分配 + childCtx 构造 + 工厂 await + setMounting 保护 + renderFn 校验）供 buildVNode/hydration 共用；renderSsr 保持独立（per-request 无状态遍历——不分配 id/不设 _render，本质不同，注释说明）。组件工厂调用语义单一事实源

## 风险与对策

| 风险 | 对策 |
|------|------|
| 渲染器重写回归（1793 测试大多过它） | S1 分五小步，每步跑相关测试；全量验证兜底 |
| 时序敏感测试（flush 次数）在 async 化后变化 | --test-timeout 定位挂起点；S1d 集中改 async 测试 |
| 动态挂载补全路径回归 | 保留占位兜底 + 局部补全测试（T9b 语义保留） |
| 并行 setMounting 栈交错 | buildVNode 不包 setMounting（renderByIds 兜底），彻底规避 |
| 测试预算 >15s | 保持 --test-concurrency=8；新增测试事件驱动断言 |

## 验收标准

- 首帧：await 全部 → 完整内容一次挂载（无占位闪烁）；骨架屏可预置
- 导航：旧页保持 → 新树构建完成 → 一次同步 diff 切换（无中间占位）
- update：同步（不变）
- 动态挂载：async 组件占位 → 局部补全（不再整树重渲染）
- 全量测试绿 + typecheck + build
