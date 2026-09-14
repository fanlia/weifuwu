# weifuwu/core 分层与冻结 —— L0/L1/L2 依赖阶梯（2026-09）

> **一句话目标**：把散落四处的隐式内核收拢为 `src/core/` 的 **L0/L1/L2 可机检阶梯**，
> 让 **L0 立即冻结 · L1 随 1.0 冻结 · L2 迁移后入承诺**——核心稳定，装备才能快跑。
>
> **动机（探针证据）**：
> - 隐式核 + 三方泄漏：候选核区 **122 文件 / 20056 行** 中含 **core→装备 泄漏边 51 条**
>   （运行时 31 / type-only 20）——`server/core/router.ts → graphql`、`vdom/core → context/browser/dev/middlewares`、
>   `hooks/chat → server/ai/types`、`orm → gql-from-shape` 等；没有冻结对象 = 爆炸半径不可计算。
> - core 依赖面：三方仅 `ws`（3 文件）+ node 内建；`graphql`(2.5MB)/`esbuild`(12MB) 经主入口静态拖入
>   （`src/server/index.ts` 导出 ui/graphql 面）。`weifuwu/core` 目前不存在。
> - 稳定 vs 演进同速：0.94→0.95 的抽象迁移（三面论 / 原语全面化 / 分层抽象 W7）仍在进行——
>   必须按层分离节奏，否则 1.0 无法承诺。
> - 分层定案（2026-09 讨论）：**依赖深度 = 冻结节奏，唯一主轴**；环境是轴内目录维度；
>   **L2 provisional（方案 A）**；同包多入口，不做独立 npm 包。

## 现状探针（2026-09-14——/tmp/core-probe.mjs，W0 固化入库）

| 读数 | 值 |
| --- | --- |
| 候选核区 | 122 文件 / 20056 行 |
| 三方依赖 | `ws` ×9（3 文件：`router.ts`/`ws.ts`/`hub.ts`）；主入口另拖 `graphql`/`esbuild` |
| node 内建 | `node:net`×6 · `node:crypto`×3 · `node:http`×2 · `node:stream`×1（net 大头 = db 线协议） |
| 泄漏边 | **51**（运行时 31 · type-only 20） |
| 泄漏热点 | `UIContext`×10（type）· `router→graphql`（运行时）· `dev/{error-counter,effect-guard,render-health}` · `Browser` · `store` · `hooks/chat→server/ai/types` · `orm→gql-from-shape/rest-from-shape` |
| 目录规模 | `db` 直层 5005（线协议另计：postgres 1597 / redis 1636）· hooks 2838 · vdom/core 5920 · server/core 1052 · shared 900 |
| 公开面 | exports 22 条（src 目录直映）；**无 `weifuwu/core` 入口** |
| 消费点 | platform `protectedRoutes.graphql('/api/gql')` · showcase `app.graphql('/api/demo/graphql')`；`ws.test.ts` 用 ws 客户端做互操作 |
| 现有防线 | 契约 515 · 场景 129 · showcase 336 · audit 九命令（十三线）；**无依赖方向/分层审计** |

## 目标形态

### 分层判据（分类三问——新能力归属只答这三问）

| Level | 定义 | 三问 | 冻结节奏 |
| --- | --- | --- | --- |
| **L0 协议** | 纯数据/协议/不变量，零效果 | 没有运行时也存在？ | **立即冻结**（快照+弃用周期） |
| **L1 运行时** | 引擎：产生效果（I/O/DOM/node） | 它"执行"某件事？ | **随 1.0 冻结** |
| **L2 生成** | 从声明生成行为/机械部分 | 它在"生成"什么？ | **迁移后入承诺（provisional）** |
| 装备 | 以上都不满足 | — | 自由演进/可弃 |

### 规则矩阵（审计规则单源）

| 规则 | L0 | L1（universal） | L1/server | L1/client | L2 |
| --- | --- | --- | --- | --- | --- |
| 允许 import | L0 only | L0 | L0+L1 | L0+L1 | L0/L1（禁反向） |
| 环境 | universal | universal | `node:*` | DOM | 视子目录 |
| 三方依赖 | **0** | **0** | **0**（ws 出核） | **0** | **0** |
| 测试 | 纯函数零 mock | node 直跑 | node 直跑、无 docker | 契约 harness | 契约 harness |
| 规模 | 只降不升 | 只降不升 | 只降不升 | 只降不升 | 迁移期豁免，完成后锁 |

### 目录形态（目录即标签）

```
src/core/
├── levels.json        # W0 生成物——模块→{level,env} 审计单一事实源
├── l0/                # universal（禁 node:/DOM/状态/三方）
├── l1/                # universal 运行时（observable 等）
│   ├── server/        # node:*
│   └── client/        # DOM
└── l2/
    ├── server/
    └── client/
```

### 承诺边界（本计划最重要的一个决定）

- **L0**：冻结面——出口快照 golden，变更 = 显式事件（RFC 级）。
- **L1**：随 1.0 冻结；0.x 内变更需弃用记录 + 快照 diff。
- **L2**：**provisional**——三面论 / 原语全面化 / 分层抽象 W7 收口前不承诺（不污染 core 名义）；
  收口后按 L1 规则冻结。**本计划不做抽象迁移本身**，只为其准备冻结条件。
- **入口**：`weifuwu/core`（通用）· `weifuwu/core/server` · `weifuwu/core/client`；
  旧路径（`weifuwu`/`weifuwu/client/vdom`/`weifuwu/shared/router`/`weifuwu/server/core`）
  保留 re-export shim + 弃用 warn（1.0 移除）。

### 分层归属（W0 实测定稿——以 `src/core/levels.json` 为单一事实源）

| 层 | 成员（定稿） |
| --- | --- |
| L0 | `shared/router` · `shared/zod` · vdom 协议面（`vnode`/`protocol` 类型/`node/hole`/`command/*`/`field/key`）· `db/{shape,ops,query,contracts,errors,filter}` · `server/types.ts` |
| L1 | `server/core`（serve/Router/ws 端口/hub/collect/error-counter）· `server/response.ts` · vdom 引擎（`v2`/`patch`/`transform`/`ssr`/`field`/`diff`/`node` 运行时）· 收编 `vdom/{context,browser,dev,store}` · `vdom/observable` · **`hooks/**`（运行时行为——W0 按三问重定位：L1 引擎运行时直接调用 `createUi`/`asyncDataPreload`，原建议表误放 L2）** · db 运行时（`orm`/`query-builder`/`typed-query`/`schema`/`memory-sql`/`consistency`） |
| L2 | **纯生成器 7 文件**：`create-component`/`create-item`/`semantic` · `layout/{define,decl}` · `db/{body,http}` |
| 装备 | components/布局 CSS/office · 中间件（ai/email/user/queue/scheduler/messager/rate-limit/static/cors/compress/**graphql**）· 线协议（`server/{postgres,redis}` + `db/{postgres,redis,memory-redis,redis-server}`）· 生成器（`gql-from-shape`/`rest-from-shape` 外移）· ui/dev/testing/workflow/workflows/sandbox |

> W0 实测：**L0 23 文件/2598 行/188 导出 · L1 83/12803/374 · L2 7/693/22 · 范围装备 17/4729/72**；未分类 0。

## 波次

| 波次 | 内容 | 验收（可运行断言） |
| --- | --- | --- |
| **W0 清单** | 探针固化入 `scripts/core-levels.mjs`：逐文件生成 `src/core/levels.json`（level/env）+ 三层基线（行数/文件数/导出数）+ 泄漏基线；归属判据写入文档草稿 | 100% 文件分类无未知；`levels.json` + 基线入库；三层数字入实录 |
| **W1 防线先行** | `audit:core-levels`（依赖方向/环境/三方——**先黄后红**：存量违规入 `scripts/core-levels-baseline.json`，新增即红）+ `test:core`（无 docker/无浏览器）+ import-graph 断言（esbuild metafile：core 入口不含 `esbuild`/`graphql`/`ws`） | 存量违规可见入基线；注入探针（新增一条上行 import）即红；`test:core` 绿（过渡期 = `src/test/contract/**` + `src/shared/**` + `src/core/**`） |
| **W2 割外** | ① graphql 中间件化：删 `Router.graphql`，新增 `graphql()` 中间件；platform/showcase 两处改 `app.use(graphql('/path', handler))` ② ws 端口化：`WsAdapter` 端口 + `hasWsRoutes()` 才挂 upgrade；ws 实现移装备（core 静态三方=0；缺适配器时 WS 路由显式报错）③ db 装备外移（线协议/生成器目录归位）④ `orm.gql/orm.rest` 插件化（`orm.ts` 不再 import 生成器） | 51 泄漏边 → 0（或全登记）；core 三方 import = 0；graphql 契约测试绿；`test:server` + platform 507 绿 |
| **W3 收编+搬家** | ① 收编 `vdom/{context,browser,dev,store}` 入核（~760 行）+ Api/Auth/Ws 端口类型入核（中间件只留实现）② AI 线协议类型收敛至 `shared/ai` ③ `src/core/{l0,l1,l2}` 目录迁移（git rename）+ exports/shim + tsconfig/build/审计路径同步 ④ VDOM v1 残留清理（无消费者则删，有则登记） | `audit:core-levels` 全绿；`tsc` 0；`npm run build` + dist 正常；showcase / platform 全绿；旧路径 shim 可用（warn 可见） |
| **W4 加锁** | L0 出口快照 golden + 三层规模基线（只降不升）+ `docs/core.md`（levels.json 生成 + L0 协议规范面）+ 接入 `audit:all` + 路径感知 CI 命令说明（core 变更 → 核套件+全回归） | 改 L0 导出 → 快照红；规模超基线 → 红；docs 漂移哨兵绿；`audit:all` 含新线 |
| **W5 自研 ws（条件波次）** | native RFC6455 最小服务端成为默认适配器（握手/帧编解码/分片/控制帧/关闭/UTF-8/背压/限额）；`ws` 降 devDependency（差分对账参考） | RFC 向量绿；帧边界矩阵绿；**Autobahn 全绿（诚实裁剪项除外）**；差分 fuzz 0 不等价；`ws.test.ts` 不改绿；**不达标 → 判负回退 W2 适配器** |
| **W6 验收实验** | ① 平台升级实验：升一次 core 版本，platform diff **零 core 改动** ② 再生成实验：新增一个组件/布局/接口，core 零改动 ③ 承诺边界声明生效（L0 冻结 / L1 待 1.0 / L2 provisional） | 平台 tsc 0 + 507 绿且未触 core；再生成实验 diff 仅装备面；承诺写入 docs |

## 判负记录（可被新论证推翻）

- **不做独立 npm 包**：同包多入口足够；独立包引入类型双实例/发布编排成本——推翻条件：出现只消费 L0 且在意安装体积的外部用户。
- **暂不暴露 `weifuwu/core/l0` 子路径**：多一个公开路径 = 多一份快照义务——推翻条件：出现"只要协议不要引擎"的真实消费者（届时 L0 已冻结，成本低）。
- **L2 不移出 core（方案 A）**：迁移成本最低，用 provisional 隔离承诺——推翻条件：L2 迁移周期超过 2 个版本。
- **不做完整 CI 平台接入**：本计划只保证命令 CI-ready（audit/test 可挂）——推翻条件：独立 CI 计划立项。
- **ws 不做 permessage-deflate / 扩展协商 / 子协议匹配**：诚实裁剪（浏览器可不协商，功能零影响）——推翻条件：真实消费者需要压缩或子协议。
- **VDOM v1 残留不无条件删**：契约层证明零消费者才删，否则登记——推翻条件：fuzz/契约覆盖证明。
- **不做抽象迁移本身**（三面论/原语全面化）：本计划只准备冻结条件，不重复既有计划——推翻条件：无。
- **不做 signal 普及/组件扩容**：与本计划无关（web 计划已判负）——登记防范围蔓延。

## 执行实录（边做边记）

- **W0（2026-09-14）**：探针固化 `scripts/core-levels.mjs`（规则表 → 生成 `src/core/levels.json` + `scripts/core-levels-baseline.json`；`--check` 骨架 + npm `core:levels` / `audit:core-levels`）；判据草稿落 `docs/core.md`。
  - 实测：**L0 23 文件/2598 行/188 导出 · L1 83/12803/374 · L2 7/693/22 · 范围装备 17/4729/72**；未分类 **0**。
  - **重定位（探针修正原建议）**：`hooks/**` L2 → **L1**（L1 引擎运行时直接调用 `createUi`/`asyncDataPreload`/`asyncDataSeed`——按三问属运行时行为；L2 收敛为纯生成器 7 文件）；`core/field/key.ts` → **L0**（零依赖纯函数——修 `vnode(L0)→field/key(L1)` 上行 1 条）。
  - 存量违规基线（W2 目标 0）：core 三方 `ws` ×3 项 · core→装备泄漏 14 条（graphql 1 · vdom 中间件 5 · orm→生成器 2 · contracts→redis 3 · hooks/chat→server/ai 1 · types→redis 1 · UIContext→auth 1）· 层内上行 2 条（`vnode→UIContext` type · `types→core/ws` type）。
  - `audit:core-levels` 通过（无新增未知/三方/泄漏/上行）。
- **W1（2026-09-14）**：防线三件套上线。
  - `audit:core-levels`：`core-levels.mjs --check`（基线逐项比对——**注入探针实测**：临时加 `errors.ts → graphql` 即红 exit 1，还原即绿）+ `core-graph.mjs --check`（esbuild metafile 全核打包——core 真实闭包三方 = **graphql, ws** 两项，与直接扫描一致；新增即红）。
  - `test:core`：`src/test/contract/**` + `src/shared/**` + `src/core/**` + `src/server/core/**` + `src/server/db/*.test.ts`（**排除 postgres/、redis/ 装备线协议真库测试**）——**830 测试 / 829 通过 / 1 docker-gated skip / 0 失败 / 6.3s**，无 docker 无浏览器（实测：docker 停止状态下全绿）。
  - 重定位登记：`test:core` 过渡期在原计划（contract+shared+core）上增收 `server/core` 与 db 直层（内核域测试预迁移——W3 目录迁移后收敛为 `src/core/**`）。
- **W2①（2026-09-14）graphql 出核**：`Router.graphql` 删除；`src/server/graphql.ts` → `src/server/middleware/graphql.ts`（git rename）+ 新 `graphql(path, handler)` 中间件（父 Router mount 机制——前缀剥离；未命中 `next` 不吞路；缺 handler 显式抛；路径相似不误吞）；消费点全迁移（showcase demo-backend · 平台 `routes-protected.ts` · 平台测试）+ `src/server/index.ts` 导出 + `docs/server.md` 示例同步。
  - 回归：graphql 契约 **20/20**（含中间件新增 4）· `test:server` **865（864 pass + 1 skip）** · `test:core` **830（829 + 1）** · 平台 gql **4/4**（先 `npm run build` 刷新 dist——平台经 exports 解析 dist）· `tsc` 0 · showcase 冒烟 3/3。
  - 泄漏基线 **14 → 12**（`router→graphql` 双向消除）；三方仍 3（`ws`——W2②）。
- **W2②（2026-09-14）ws 出核（端口化）**：core 定义 `WsHandlePort`（`handleUpgrade` + 可选 `shutdown`）；`ws` 实现移装备 `src/server/ws/adapter.ts`（1001 握手逻辑随迁）；`Router` 去 `WebSocketServer`/`_wss`（新增 `hasWsRoutes()` 计数 + `websocketHandler(port)`）；`serve()` 仅当有 WS 路由才挂 upgrade，缺适配器显式报错；入口 `serve` 包装默认注入适配器（自研 RFC6455 可换）；`hub.ts`/`messager` 改用 L0 `WebSocket`/`Hub` 结构类型（零 ws 类型依赖）。
  - 回归：ws+serve 契约 **24/24** · `test:server` **865（864 + 1）** · 场景 e2e-10 6/6 · showcase 冒烟 3/3 · `tsc` 0。
  - **core 三方 import = 0**（基线 `thirdParty: []`）；上行 **2 → 1**（剩 `vnode(L0)→UIContext(L1)` type——W2④/W3）；泄漏仍 12（vdom 端口/orm/redis 类型——W2③④）。

## 验收标准

- [x] W0：清单 100% 分类；`levels.json` + 三层基线入库
- [x] W1：`audit:core-levels` + `test:core` + import-graph 断言上线（黄→红机制验证）
- [ ] W2：泄漏边 = 0；core 三方 import = 0；graphql 中间件化消费点全迁移
- [ ] W3：目录迁移完成；收编类型/运行时到位；旧路径 shim 生效；全量回归绿
- [ ] W4：L0 快照 + 规模基线 + `docs/core.md` + `audit:all` 接入
- [ ] W5（条件）：Autobahn + 差分门槛达标，或按判负回退 ws 适配器
- [ ] W6：平台升级零 core 改动；再生成实验通过
- [ ] 全量回归门：契约 + 场景 + showcase + server + shared + audit 全线绿
- [ ] 收尾：规则并入 `docs/core.md`/`docs/server.md`/`AGENTS.md`；计划文件归档 git 历史
