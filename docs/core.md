# weifuwu/core —— 内核分层（L0/L1/L2）

> **状态：W0 草稿（2026-09）**——判据与规则为规范面；分层清单由
> `node scripts/core-levels.mjs` 生成（`src/core/levels.json`），文档在 W4 由清单生成。
> 实施过程见 `plan/core-分层与冻结.md`。

weifuwu 的内核不是目录，而是**一组"去掉就不再是 weifuwu"的机制**：双端共享路由、
命令流渲染、声明式数据面、组合/生成协议。为了保证它可冻结，内核按**依赖深度**分三层——
**Level = 依赖方向 = 环境约束 = 冻结节奏**（一条主轴，三个含义）。

## 分层判据（分类三问）

新能力归属只答这三问：

| 问题 | 是 | 归属 |
| --- | --- | --- |
| 没有运行时也存在？（纯数据/协议/不变量） | ✅ | **L0 协议**——立即冻结 |
| 它"执行"某件事？（I/O / DOM / node） | ✅ | **L1 运行时**——随 1.0 冻结 |
| 它在"生成"什么？（声明 → 行为/机械部分） | ✅ | **L2 生成**——迁移后入承诺（provisional） |
| 以上都不满足 | — | **装备**（组件/中间件/线协议/工具） |

## 规则矩阵

| 规则 | L0 | L1/universal | L1/server | L1/client | L2 |
| --- | --- | --- | --- | --- | --- |
| 允许 import | L0 only | L0 | L0+L1 | L0+L1 | L0/L1（禁反向） |
| 环境 | universal | universal | `node:*` | DOM | 视子目录 |
| 三方依赖 | 0 | 0 | 0 | 0 | 0 |
| 测试 | 纯函数零 mock | node 直跑 | node 直跑、无 docker | 契约 harness | 契约 harness |
| 变更 | 快照 + 弃用周期 | 随 1.0 | 随 1.0 | 随 1.0 | 迁移期可动 |

## 承诺边界

- **L0**：冻结面——出口快照 golden，变更属显式事件。
- **L1**：随 1.0 冻结；0.x 内变更需弃用记录 + 快照 diff。
- **L2**：provisional——三面论 / 原语全面化收口前不承诺，之后按 L1 冻结。
- **装备**：自由演进/可弃；core 不得依赖装备。

## 目录形态（W3 已落地）

```
src/core/
├── levels.json        # 生成物：模块 → {level, env, loc}
├── l0/                # universal（协议/纯数据）
├── l1/{server,client}/ # 运行时（IO/DOM/node）
└── l2/{server,client}/ # 生成器（声明 → 行为）
```

**目录即层级**：审计（`scripts/core-levels.mjs`）以 `src/core` 为唯一 scope，
按目录前缀定级——新增能力先答三问，再入对应目录。

**兼容 shim**：旧路径（`src/shared/router/**`、`src/server/db/{shape,errors,…}.ts`、
`src/client/vdom/{core,hooks,context,…}/**` 等 116 个）保留 `export *` 重出——
装备面/测试/dist 入口零改动；移除条件：1.0 或消费点全迁移。
core 自身**不得**经 shim 导入（审计对 core→非 core 导入 = 泄漏即红）。

## 工具

```bash
npm run core:levels          # 生成：清单与基线（src/core/levels.json + baseline + docs 清单块）
npm run audit:core-levels    # 校验：依赖/规模/docs 漂移/闭包 —— 任一红 = exit 1
npm run core:snapshot        # 写入 L0 出口快照（显式变更——需 commit 说明）
npm run test:core            # 内核回归（无 docker/无浏览器：契约 + shared + core + 内核域）
```

## 冻结与快照

| 机制 | 红线 | 变更路径 |
| --- | --- | --- |
| L0 出口快照（`scripts/core-l0-snapshot.json`） | 导出增删/改名/种类变化 = 红 | `npm run core:snapshot` + commit 说明 |
| 三层规模基线（`scripts/core-levels-baseline.json`） | 文件/行数/导出数**只降不升** | `npm run core:levels` 显式更新（diff 可见） |
| docs 清单块漂移 | `docs/core.md` 生成块 ≠ 生成器 = 红 | `npm run core:levels` 重生成 |
| 依赖方向/泄漏/三方 | 新增即红（存量基线登记） | 修代码，不可调白名单 |

**层级承诺（W6 定案——冻结时刻表）**：

| 层 | 承诺 | 冻结时刻 | 含义 |
| --- | --- | --- | --- |
| **L0** | 协议/不变量 | **现在**（0.x 内即冻结） | 快照红线全时生效；变更须显式写快照 + commit 说明迁移路径 |
| **L1** | 引擎（vdom/router/serve/db 契约/生成器胶水） | **1.0** | 1.0 前可演进（每变过 `test:core` + 契约/fuzz）；1.0 后同 L0 机制 |
| **L2** | 生成器（纯函数） | **provisional**（可重写） | 跨版本不承诺兼容；是实验面而非稳定面 |

**验收实验（W6 实证——"再生成=零 core 改动"）**：

| 实验 | 产物（装备面） | 结果 |
| --- | --- | --- |
| 新组件 | `createComponent` 声明（状态类/aria 机械生成） | 契约 **2/2** 绿；core 零改动（levels/snapshot 无漂移） |
| 新接口 | 全新 shape + DDL 声明 + `orm.rest` 生成器（CRUD + 租户 scope） | **4/4** 绿；core 零改动 |
| 平台升级 | W2②→W5 core **117 文件 / +16665 −402** | platform `src/` **零改动**；平台 tsc **0** · 507 绿 |

> 平台 tsc 0 的前提修复：`apps/agent-platform/tsconfig.json` 显式 `"types": ["node"]`
> （此前 393 条缺失 node 类型误报——配置面缺口，非代码缺陷；已加 `npm run typecheck`）。

## 清单（生成面）

<!-- core-inventory:start（由 npm run core:levels 生成——勿手改） -->
| 层 | 文件 | 行数 | 导出 |
| --- | --- | --- | --- |
| L0 | 25 | 2856 | 215 |
| L1 | 84 | 12918 | 383 |
| L2 | 7 | 693 | 22 |

**L0（25）**

- `src/core/l0/ai/types.ts`（universal · 165 行）
- `src/core/l0/db/contracts.ts`（universal · 114 行）
- `src/core/l0/db/errors.ts`（universal · 90 行）
- `src/core/l0/db/filter.ts`（universal · 66 行）
- `src/core/l0/db/generator-contracts.ts`（universal · 59 行）
- `src/core/l0/db/ops.ts`（universal · 154 行）
- `src/core/l0/db/query.ts`（universal · 561 行）
- `src/core/l0/db/shape.ts`（universal · 211 行）
- `src/core/l0/router/chain.ts`（universal · 31 行）
- `src/core/l0/router/context.ts`（universal · 68 行）
- `src/core/l0/router/ctx-fields.ts`（universal · 43 行）
- `src/core/l0/router/index.ts`（universal · 18 行）
- `src/core/l0/router/pipeline.ts`（universal · 131 行）
- `src/core/l0/router/trie.ts`（universal · 203 行）
- `src/core/l0/router/types.ts`（universal · 35 行）
- `src/core/l0/types.ts`（universal · 154 行）
- `src/core/l0/vdom/command/create.ts`（universal · 29 行）
- `src/core/l0/vdom/command/index.ts`（universal · 40 行）
- `src/core/l0/vdom/command/insert.ts`（universal · 36 行）
- `src/core/l0/vdom/command/lifecycle.ts`（universal · 54 行）
- `src/core/l0/vdom/command/props.ts`（universal · 25 行）
- `src/core/l0/vdom/field/key.ts`（universal · 36 行）
- `src/core/l0/vdom/node/hole.ts`（universal · 59 行）
- `src/core/l0/vdom/vnode.ts`（universal · 103 行）
- `src/core/l0/zod.ts`（universal · 371 行）

**L1（84）**

- `src/core/l1/client/vdom/async-guard.ts`（client · 34 行）
- `src/core/l1/client/vdom/browser/Browser.ts`（client · 79 行）
- `src/core/l1/client/vdom/browser/create-client-browser.ts`（client · 104 行）
- `src/core/l1/client/vdom/context/UIContext.ts`（client · 70 行）
- `src/core/l1/client/vdom/context/data.ts`（client · 70 行）
- `src/core/l1/client/vdom/dev/effect-guard.ts`（client · 66 行）
- `src/core/l1/client/vdom/dev/error-counter.ts`（client · 63 行）
- `src/core/l1/client/vdom/dev/render-health.ts`（client · 179 行）
- `src/core/l1/client/vdom/diff/attrs.ts`（client · 55 行）
- `src/core/l1/client/vdom/diff/cleanup.ts`（client · 155 行）
- `src/core/l1/client/vdom/field/attributes.ts`（client · 75 行）
- `src/core/l1/client/vdom/field/events.ts`（client · 171 行）
- `src/core/l1/client/vdom/field/index.ts`（client · 21 行）
- `src/core/l1/client/vdom/field/input-sync.ts`（client · 39 行）
- `src/core/l1/client/vdom/field/props.ts`（client · 60 行）
- `src/core/l1/client/vdom/field/ref.ts`（client · 103 行）
- `src/core/l1/client/vdom/field/style.ts`（client · 64 行）
- `src/core/l1/client/vdom/hooks/ai-stream.ts`（client · 180 行）
- `src/core/l1/client/vdom/hooks/basic.ts`（client · 113 行）
- `src/core/l1/client/vdom/hooks/chat.ts`（client · 400 行）
- `src/core/l1/client/vdom/hooks/controlled.ts`（client · 59 行）
- `src/core/l1/client/vdom/hooks/drag-media.ts`（client · 133 行）
- `src/core/l1/client/vdom/hooks/env.ts`（client · 331 行）
- `src/core/l1/client/vdom/hooks/field.ts`（client · 98 行）
- `src/core/l1/client/vdom/hooks/input.ts`（client · 93 行）
- `src/core/l1/client/vdom/hooks/observe.ts`（client · 258 行）
- `src/core/l1/client/vdom/hooks/overlay.ts`（client · 106 行）
- `src/core/l1/client/vdom/hooks/popup-manager.ts`（client · 563 行）
- `src/core/l1/client/vdom/hooks/popup.ts`（client · 148 行）
- `src/core/l1/client/vdom/hooks/signal.ts`（client · 42 行）
- `src/core/l1/client/vdom/hooks/stable.ts`（client · 260 行）
- `src/core/l1/client/vdom/hooks/use-observable.ts`（client · 54 行）
- `src/core/l1/client/vdom/node/children.ts`（client · 37 行）
- `src/core/l1/client/vdom/node/component.ts`（client · 269 行）
- `src/core/l1/client/vdom/node/fragment.ts`（client · 20 行）
- `src/core/l1/client/vdom/node/index.ts`（client · 63 行）
- `src/core/l1/client/vdom/node/keyed.ts`（client · 168 行）
- `src/core/l1/client/vdom/node/native.ts`（client · 80 行）
- `src/core/l1/client/vdom/node/portal.ts`（client · 16 行）
- `src/core/l1/client/vdom/observable/index.ts`（client · 14 行）
- `src/core/l1/client/vdom/observable/observable.ts`（client · 90 行）
- `src/core/l1/client/vdom/observable/operators.ts`（client · 400 行）
- `src/core/l1/client/vdom/observable/sources.ts`（client · 132 行）
- `src/core/l1/client/vdom/observable/types.ts`（client · 49 行）
- `src/core/l1/client/vdom/patch/fields.ts`（client · 59 行）
- `src/core/l1/client/vdom/patch/index.ts`（client · 226 行）
- `src/core/l1/client/vdom/patch/processors.ts`（client · 364 行）
- `src/core/l1/client/vdom/patch/state-machine.ts`（client · 143 行）
- `src/core/l1/client/vdom/patch/verify.ts`（client · 48 行）
- `src/core/l1/client/vdom/ports.ts`（client · 101 行）
- `src/core/l1/client/vdom/protocol.ts`（client · 153 行）
- `src/core/l1/client/vdom/router.ts`（client · 102 行）
- `src/core/l1/client/vdom/ssr/absorb.ts`（client · 150 行）
- `src/core/l1/client/vdom/ssr/html.ts`（client · 117 行）
- `src/core/l1/client/vdom/store.ts`（client · 137 行）
- `src/core/l1/client/vdom/transform/component.ts`（client · 57 行）
- `src/core/l1/client/vdom/transform/element.ts`（client · 28 行）
- `src/core/l1/client/vdom/transform/fragment.ts`（client · 38 行）
- `src/core/l1/client/vdom/transform/hole.ts`（client · 19 行）
- `src/core/l1/client/vdom/transform/index.ts`（client · 55 行）
- `src/core/l1/client/vdom/transform/states.ts`（client · 37 行）
- `src/core/l1/client/vdom/transform/table.ts`（client · 57 行）
- `src/core/l1/client/vdom/transform/text.ts`（client · 16 行）
- `src/core/l1/client/vdom/v2/cycle.ts`（client · 141 行）
- `src/core/l1/client/vdom/v2/diff.ts`（client · 979 行）
- `src/core/l1/client/vdom/v2/integrate.ts`（client · 86 行）
- `src/core/l1/client/vdom/v2/render.ts`（client · 269 行）
- `src/core/l1/client/vdom/v2/schedule.ts`（client · 92 行）
- `src/core/l1/client/vdom/v2/serve.ts`（client · 364 行）
- `src/core/l1/client/vdom/v2/spy.ts`（client · 27 行）
- `src/core/l1/client/vdom/v2/ssr.ts`（client · 106 行）
- `src/core/l1/server/collect.ts`（server · 90 行）
- `src/core/l1/server/db/consistency.ts`（server · 80 行）
- `src/core/l1/server/db/memory-sql.ts`（server · 949 行）
- `src/core/l1/server/db/orm.ts`（server · 388 行）
- `src/core/l1/server/db/query-builder.ts`（server · 245 行）
- `src/core/l1/server/db/schema.ts`（server · 375 行）
- `src/core/l1/server/db/typed-query.ts`（server · 154 行）
- `src/core/l1/server/error-counter.ts`（server · 54 行）
- `src/core/l1/server/hub.ts`（server · 45 行）
- `src/core/l1/server/response.ts`（server · 118 行）
- `src/core/l1/server/router.ts`（server · 366 行）
- `src/core/l1/server/serve.ts`（server · 350 行）
- `src/core/l1/server/ws.ts`（server · 149 行）

**L2（7）**

- `src/core/l2/client/layout/decl.ts`（client · 62 行）
- `src/core/l2/client/layout/define.ts`（client · 97 行）
- `src/core/l2/client/vdom/create-component.ts`（client · 78 行）
- `src/core/l2/client/vdom/create-item.ts`（client · 181 行）
- `src/core/l2/client/vdom/semantic.ts`（client · 114 行）
- `src/core/l2/server/db/body.ts`（server · 75 行）
- `src/core/l2/server/db/http.ts`（server · 86 行）
<!-- core-inventory:end -->

（装备面不在 scope——组件/中间件/线协议/工具范围外，自由演进。）

违规基线（W4 收口）：**core→装备泄漏 0 · 三方依赖 0 · 未知 0 · 闭包三方 0**；层内上行 1（`vnode(L0)→UIContext(L1)` type——待收编/登记）。

## CI 命令（路径感知）

| 变更面 | 最小门 |
| --- | --- |
| `src/core/l0/**` / `scripts/core-*` | `npm run audit:core-levels && npm run test:core`（L0 快照红 = 显式事件） |
| `src/core/{l1,l2}/**` | `npm run test:core && npm run test:server` |
| 装备面（组件/中间件/平台） | 对应域测试 + `npm run audit:all` |
| 全量（批次末） | `npm run test:client && test:scenario && test:server` + `npm run audit:all`（含本线） |
