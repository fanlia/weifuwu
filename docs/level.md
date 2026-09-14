# weifuwu/core —— 内核分层（L0/L1/L2）

> **状态：W0 草稿（2026-09）**——判据与规则为规范面；分层清单由
> `node scripts/level-map.mjs` 生成（`src/levels.json`），文档在 W4 由清单生成。
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

**目录即层级**：审计（`scripts/level-map.mjs`）以 `src/core` 为唯一 scope，
按目录前缀定级——新增能力先答三问，再入对应目录。

**兼容 shim**：旧路径（`src/shared/router/**`、`src/server/db/{shape,errors,…}.ts`、
`src/client/vdom/{core,hooks,context,…}/**` 等 116 个）保留 `export *` 重出——
装备面/测试/dist 入口零改动；移除条件：1.0 或消费点全迁移。
core 自身**不得**经 shim 导入（审计对 core→非 core 导入 = 泄漏即红）。

## 工具

```bash
npm run level:map          # 生成：清单与基线（src/levels.json + baseline + docs 清单块）
npm run audit:levels    # 校验：依赖/规模/docs 漂移/闭包 —— 任一红 = exit 1
npm run level0:snapshot        # 写入 L0 出口快照（显式变更——需 commit 说明）
npm run test:levels            # 内核回归（无 docker/无浏览器：契约 + shared + core + 内核域）
```

## 冻结与快照

| 机制 | 红线 | 变更路径 |
| --- | --- | --- |
| L0 出口快照（`scripts/level0-snapshot.json`） | 导出增删/改名/种类变化 = 红 | `npm run level0:snapshot` + commit 说明 |
| 三层规模基线（`scripts/level-map-baseline.json`） | 文件/行数/导出数**只降不升** | `npm run level:map` 显式更新（diff 可见） |
| docs 清单块漂移 | `docs/level.md` 生成块 ≠ 生成器 = 红 | `npm run level:map` 重生成 |
| 依赖方向/泄漏/三方 | 新增即红（存量基线登记） | 修代码，不可调白名单 |

**层级承诺（W6 定案——冻结时刻表）**：

| 层 | 承诺 | 冻结时刻 | 含义 |
| --- | --- | --- | --- |
| **L0** | 协议/不变量 | **现在**（0.x 内即冻结） | 快照红线全时生效；变更须显式写快照 + commit 说明迁移路径 |
| **L1** | 引擎（vdom/router/serve/db 契约/生成器胶水） | **1.0** | 1.0 前可演进（每变过 `test:levels` + 契约/fuzz）；1.0 后同 L0 机制 |
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

<!-- level-inventory:start（由 npm run level:map 生成——勿手改） -->
| 层 | 源码 | 行数 | 导出 | 资产 | 测试 |
| --- | --- | --- | --- | --- | --- |
| L0 协议/纯数据 | 25 | 2856 | 215 | 0 | 0 |
| L1 通用运行时 | 19 | 1832 | 96 | 0 | 0 |
| L2 服务端运行时 | 13 | 3363 | 78 | 0 | 0 |
| L3 客户端运行时 | 51 | 7702 | 203 | 0 | 0 |
| L4 生成器 | 7 | 693 | 22 | 0 | 0 |
| L5 装备 | 235 | 35992 | 895 | 167 | 347 |
| L6 装配+应用 | 172 | 35583 | 998 | 17 | 0 |

闭包读数：种子 - · 客户端 - · 通用 -（规则入库——剥注释口径）

shim 位点 0（迁移时删除——不再生成）· 清单全量见 `src/levels.json`
<!-- level-inventory:end -->

（装备面不在 scope——组件/中间件/线协议/工具范围外，自由演进。）

违规基线（W4 收口）：**core→装备泄漏 0 · 三方依赖 0 · 未知 0 · 闭包三方 0**；层内上行 1（`vnode(L0)→UIContext(L1)` type——待收编/登记）。

## CI 命令（路径感知）

| 变更面 | 最小门 |
| --- | --- |
| `src/core/l0/**` / `scripts/core-*` | `npm run audit:levels && npm run test:levels`（L0 快照红 = 显式事件） |
| `src/core/{l1,l2}/**` | `npm run test:levels && npm run test:server` |
| 装备面（组件/中间件/平台） | 对应域测试 + `npm run audit:all` |
| 全量（批次末） | `npm run test:client && test:scenario && test:server` + `npm run audit:all`（含本线） |
