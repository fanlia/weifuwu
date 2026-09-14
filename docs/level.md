# weifuwu 分层（level0–level6）

> **状态：W4 定稿（2027-xx）**——分层清单由 `node scripts/level-map.mjs` 生成
> （`src/levels.json`）；本文生成块勿手改。迁移过程由 git log 承接
> （原计划 `plan/level-分层重构.md` 已归档）。
> 外部消费者破坏性变更见 [docs/migration.md](migration.md)。

weifuwu 的分层不是目录美学，而是**依赖方向 = 环境约束 = 冻结节奏**（一条主轴，三个含义）。

## 判据（分类三问）

| 问题 | 归属 |
| --- | --- |
| 没有运行时也存在？（协议 / 纯数据 / 不变量） | **level0** 协议 |
| 通用运行时？（无 DOM、无 node I/O——双环境可用） | **level1** 通用运行时 |
| 服务端运行时？（`node:*` I/O） | **level2** 服务端运行时 |
| 客户端运行时？（DOM） | **level3** 客户端运行时 |
| 纯生成器？（声明 → 机械产物——纯函数） | **level4** 生成器 |
| 装备？（组件 / 中间件 / 线协议 / 工具——可弃） | **level5** 装备 |
| 装配与应用？（入口聚合 + 两个可启动应用） | **level6** 装配+应用 |

**目录即层级**：`src/levelN/**` 是唯一 scope；新增能力先答三问，再入对应目录。
`src/levels.json` 是分类清单（`{ kind, level, env, target, loc }`），
`audit:levels` 以它 + 解析出的依赖图做方向/环境/三方/规模/docs 五面校验。

## 目录形态（W1 落地）

```
src/level0/   协议（vdom vnode/command · router 五层 · types · 错误契约）
src/level1/   通用运行时（observable · node/fragment/keyed/portal · 通用 hooks · patch 状态机 · store · ports）
src/level2/   服务端运行时（router 实现 · serve · ws/hub · response · db 协议引擎 · error-counter）
src/level3/   客户端运行时（vdom v2 引擎全量：render/diff/context/hooks/browser/field/ssr/patch）
src/level4/   生成器（create-item · create-component · semantic · vdom 纯生成器）
src/level5/   装备（client components/layout/office · server ai/db/queue/scheduler/messager/user/... · cli · sandbox Go）
src/level6/   装配 + 应用（index.ts 主入口 · server/* 子入口 · client/* 入口 · dev · apps/{showcase,agent-platform}）
```

## 依赖方向（审计红线的来源）

| 层 | 允许 import（同级或更低） | 环境 | 三方依赖 |
| --- | --- | --- | --- |
| level0 | 0 | universal | 0 |
| level1 | 0,1 | universal（无 DOM、无 `node:*`） | 0 |
| level2 | 0,1,2 | node | 0 |
| level3 | 0,1,3 | DOM | 0 |
| level4 | 0..4 | 视目标 | 0 |
| level5 | 0..5 | 视文件 | 允许（装备面） |
| level6 | 0..6 | 装配 | 允许 |

> **上行 = 红**（低层 import 高层）· **经 shim = 红** · **未分类 = 红** · **闭包三方 = 红**。
> 存量违规逐条登记（只能缩小）——见 `scripts/level-map-baseline.json`。

**闭包口径**：DOM 代码面种子（11 词）→ 传递闭包 → 通用 19 / 客户端 52（剥注释口径——
注释提及不算；`audit:levels` 复算一致性）。

## 冻结与快照

| 机制 | 红线 | 变更路径 |
| --- | --- | --- |
| level0 出口快照（`scripts/level0-snapshot.json`） | 导出增删/改名/种类变化 = 红 | `npm run level0:snapshot` + commit 说明 |
| 七级规模基线（`scripts/level-map-baseline.json`） | 文件/行数/导出数**只降不升** | `npm run level:map` 显式更新（diff 可见） |
| docs 清单块漂移 | `docs/level.md` 生成块 ≠ 生成器 = 红 | `npm run level:map` 重生成 |
| 依赖方向/环境/三方 | 新增即红（存量基线登记） | 修代码，不可调白名单 |

| 层 | 承诺 | 冻结时刻 |
| --- | --- | --- |
| level0 | 协议/不变量 | **现在**（0.x 内即冻结——快照红线全时生效） |
| level1–3 | 运行时（引擎/router/serve/db 契约） | **1.0**（1.0 前可演进；每变过契约/fuzz） |
| level4 | 生成器（纯函数） | **provisional**（跨版本不承诺兼容） |
| level5 | 装备 | 自由演进/可弃（level0-4 不得依赖 level5） |
| level6 | 装配 + 应用 | 随框架版本与示例节奏 |

## 工具

```bash
npm run level:map        # 生成：清单/基线/docs 块（src/levels.json + baseline + docs/level.md）
npm run audit:levels     # 校验：依赖方向/环境/三方/规模/docs 漂移/L0 快照 —— 任一红 = exit 1
npm run level0:snapshot  # 写入 L0 出口快照（显式变更——需 commit 说明）
npm run test:levels      # 内核回归（level0–4——无 docker/无浏览器：契约 + 内核域）
```

## 包面（W3）

`exports` 字段已删除——**dist 树即导出面**：

- 入口 JS（bundle）：`weifuwu/dist/level6/index.js` · `weifuwu/dist/level6/client/vdom/index.js` ·
  `weifuwu/dist/level6/client/components/index.js` · `weifuwu/dist/level0/router/index.js` 等；
- `dist/levelN/**` 同时随包源码树（TS/TSX——`ctx.ui` 浏览器编译输入端；**Node 在
  `node_modules` 下拒绝 TS 类型剥离**，Node 导入请用入口 `.js`）；
- 两个应用 bin：`weifuwu-showcase` / `weifuwu-platform`（→ `dist/level6/apps/*/cli.js`）。

外部消费者的路径映射与破坏性变更见 [docs/migration.md](migration.md)。

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
| L6 装配+应用 | 172 | 35614 | 998 | 17 | 0 |

闭包读数：（迁移后）由目录定级——level1 通用 19 · level3 客户端 51（剥注释口径——分类规则见 git log）

shim 位点 0（迁移时删除——不再生成）· 清单全量见 `src/levels.json`
<!-- level-inventory:end -->

违规基线（W4 收口）：**三方 0 · 未知 0 · shim 0（旧 116 位点迁移时删除——不再生成）·
未解析 0 · 闭包三方 0**；层内上行 1（`level0/vdom/vnode.ts` → `level3/vdom/context/UIContext.ts`
的 type 导入——登记待收编）。

## CI 命令（路径感知）

| 变更面 | 最小门 |
| --- | --- |
| `src/level0/**` | `npm run audit:levels && npm run test:levels`（L0 快照红 = 显式事件） |
| `src/level{1,2,3,4}/**` | `npm run test:levels && npm run test:client` |
| `src/level5/**`（装备） | 对应域测试 + `npm run audit:all` |
| `src/level6/apps/agent-platform/**` | `npm run platform:test`（507——协议 + UI） |
| `src/level6/apps/showcase/**` | `npm run test:showcase`（336） |
| 全量（批次末） | 五域 + `platform:test` + `npm run audit:all`（含本线） |
