# level 分层重构——全库七级 · 单包化（2026-09-14）

> **一句话目标**：把 `core + 装备 + 入口 + apps` 收拢为**一个包内的七级阶梯**
> `src/level0 … src/level6`——协议 → 运行时 → 生成 → 装备 → 应用；
> 依赖只允许低→高；对外入口 `weifuwu/level0 … weifuwu/level6`；
> **core 概念整体退场**（目录/脚本/审计/文档/命令）；**不留 shim**（一次性全量重写）；
> **两个应用（showcase/agent-platform）内化为 level6 并从包导出**——用户安装后即可启动。
>
> **动机（探针证据）**：
> - 上轮（core-分层与冻结）留下**双轨**：core 有层级，装备/入口/apps 没有；跨层约束停在 core 边界。
> - 用户决策三点：① 全库七级、取消 core；② 本次不留 shim（接受破坏性重写，0.x 窗口）；
>   ③ `apps/` 不再独立 package——纳入 weifuwu 内部并从包导出（安装即用）。
> - 可行性：`apps/showcase` 已无 package.json（只差搬家）；`apps/agent-platform` package.json
>   仅 scripts 无依赖（node_modules 只有 `weifuwu` 符号链接）——"独立包"名存实亡。

## 现状探针（先读数）

| 读数 | 值 |
| --- | --- |
| `src` 源文件（非测试，含 css） | **658**（core 116 · shim 124 · 入口 19 · 装备 395 · 测试辅助 4） |
| core（5 组） | `l0` 25 · `l1/server` 13 · `l1/client` 71 · `l2/server` 2 · `l2/client` 5 |
| 客户端/通用边界实测 | `l1/client` 71 = DOM 传递闭包 **55**（客户端运行时）+ **16**（通用运行时） |
| apps 源文件 | showcase **27 非测试 + 138 测试** · agent-platform **128 非测试 + 99 测试**（另含 public/skills/design/docs 等资产目录） |
| apps 引用框架 | platform **125 文件 / 213 处** `from 'weifuwu'` · showcase **18 文件 / 62 处** |
| apps 启动/构建 | showcase：`node server.ts`（esbuild 运行时编译）；platform：`node --env-file=.env server.ts` + ui esbuild 构建 + Go sandbox agent（`src/sandbox`） |
| apps 包面 | showcase 无 package.json；platform package.json 无 deps/devDeps（仅 scripts）· node_modules 仅 `weifuwu → 仓库根` 符号链接 |
| 根包面 | `bin: null` · `files: ["dist/","README.md","docs/"]` · **deps = `esbuild` + `graphql`** · **devDeps = `@types/node@^26.5.1` + `playwright`** · peerDependencies = 无 |
| 外部 DB 驱动实态 | `postgres`/`ioredis` **已删除**（死 devDeps——0 调用点；commit 4d03736f） |
| 自研引擎（已在位） | PG v3：`src/server/db/postgres/{protocol,connection,pool}.ts`（SCRAM/md5/cleartext · extended query · 池）· RESP2：`src/server/db/redis/{resp,connection,subscriber}.ts`（离线队列/重连）——真实 docker 测试已覆盖 |
| Go 资产 | `src/sandbox/`（5 Go 文件——platform 容器 agent） |
| 依赖面收敛（2026-09 前置完成） | CSS 外部件（tailwindcss/postcss/@tailwindcss/postcss：运行时支路 + 可选 peer + 测试解析器→内部 `css-parse.ts`，168 语料对账等价）· `puppeteer-core`/`@graphql-tools/schema`（零调用）· `ws`（包 + adapter 差分实现→undici 全局客户端互操作）· `@types/node` ^26 |

**闭包口径**（探针 `/tmp/w7-closure.mjs`，W0 固化入库）：
种子 = 直接使用 DOM 全局的 27 文件；**谁 import 客户端文件谁也是客户端**（传递闭包）；
不在闭包内且无 `node:`/DOM = 通用运行时。实测 27 → 55 / 16。

**level1 实测 16**：`async-guard.ts` · `dev/error-counter.ts` · `hooks/ai-stream.ts` ·
`node/{children,fragment,index,keyed,portal}.ts` · `observable/{index,observable,operators,sources,types}.ts` ·
`patch/state-machine.ts` · `ports.ts` · `store.ts`

**level2 实测 13**：`collect.ts` · `error-counter.ts` · `hub.ts` · `response.ts` · `router.ts` · `serve.ts` · `ws.ts` ·
`db/{consistency,memory-sql,orm,query-builder,schema,typed-query}.ts`

**level6 入口聚合实测 19**：`server/index.ts`（主入口）· `server/{ai,email,messager,postgres,queue,redis,scheduler,ui,user,workflow,workflows}/index.ts` ·
`client/{vdom/index.ts,vdom/jsx-runtime.ts,vdom/testing.ts,components/index.ts,layout/index.ts}` · `dev/index.ts` · `shared/router/index.ts`

## 目标形态

### 七级定义（含应用）

| level | 语义 | 内容 | 环境 | 冻结 |
| --- | --- | --- | --- | --- |
| **0** | 协议/纯数据 | 现 `core/l0` 25（vdom/路由/db 协议 · zod · AI 类型 · 通用契约 · 生成器契约） | universal | **现在**（出口快照 golden） |
| **1** | 通用运行时 | 上表 16（observable/store · node 原语 · ports · async-guard · error-counter · ai-stream） | universal | 1.0 |
| **2** | 服务端运行时 | 上表 13（Router · serve · WS 端口 · hub · response · collect · ORM · 数据面） | `node:*` | 1.0 |
| **3** | 客户端运行时 | `l1/client` 闭包 55（vdom 引擎 · patch/transform/field · hooks · browser · UIContext · ssr-ui · client router） | DOM | 1.0 |
| **4** | 生成器 | 现 `core/l2` 7（createComponent · createItem · semantic · layout · body · http） | universal | provisional |
| **5** | 装备 | ~400（components · middleware · 线协议 · ai/email/user/queue/scheduler/messager/workflow · ui/dev/office/testing · layout CSS · client middlewares · **sandbox Go**） | mixed | 自由 |
| **6** | 装配 + 应用 | 19 个公开入口聚合 + **showcase + agent-platform 两个应用**（含资产） | mixed | 自由 |

> level6 双角色明示：**装配**（入口聚合——`weifuwu/level6` 的框架面）与**应用**（两个可启动应用——bin 面）。
> 应用模块独立子目录，不入 level6 barrel 的库导出。

### 依赖规则（审计矩阵——单源）

| 规则 | L0 | L1 | L2 | L3 | L4 | L5 | L6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 允许 import | L0 | ≤L1 | ≤L2 | ≤L1 + L3 | ≤L4 | ≤L5 | ≤L6 |
| 特例 | — | 禁 `node:`/DOM | 禁 DOM | **禁 L2**（客户端不得消费服务端） | 禁 `node:`/DOM | — | 应用可 import 任意层 |
| 三方依赖 | 0 | 0 | 0 | 0 | 0 | `graphql` 等（装备面） | `esbuild`/`playwright`（应用/测试） |
| 规模 | 只降不升 | 只降不升 | 只降不升 | 只降不升 | provisional | — | — |
| 快照 | 出口 golden | — | — | — | — | — | — |

### 目录形态

```
src/
├── level0/ … level5/          # 协议 → 装备（目录即层级）
├── level6/                    # 装配 + 应用
│   ├── index.ts               # 电池全含聚合（= 旧主入口 src/server/index.ts）
│   ├── server/**  client/**  dev/**  shared/router/**   # 旧 19 入口的聚合面
│   ├── apps/showcase/**       # 应用（server.ts · src · test · 资产）
│   └── apps/agent-platform/** # 应用（server.ts · src · test · ui · public · skills · scripts…）
├── levels.json                # 生成物：全库文件 → {level, env}（含应用）
└── test/                      # 测试面（不参与分层——可 import 任意层）
（apps/ 目录解散；旧路径全部删除——无 shim）
```

**迁移路径**：

| 现路径 | 新路径 |
| --- | --- |
| `src/core/l0/**` | `src/level0/**` |
| `src/core/l1/client/**`（闭包外 16） | `src/level1/**` |
| `src/core/l1/server/**` | `src/level2/**` |
| `src/core/l1/client/**`（闭包内 55） | `src/level3/**` |
| `src/core/l2/**` | `src/level4/**` |
| 装备（现域目录） | `src/level5/<原域目录>/**` |
| `src/sandbox/**`（Go） | `src/level5/sandbox/**` |
| 19 入口 | `src/level6/{server,client,dev,shared}/**`（去首段，如 `server/ai/index.ts` → `level6/server/ai/index.ts`；主入口 → `level6/index.ts`） |
| `apps/showcase/**` | `src/level6/apps/showcase/**` |
| `apps/agent-platform/**` | `src/level6/apps/agent-platform/**`（node_modules 符号链接删除） |
| 旧路径（117 shim 位点） | **删除**（全库 import 一次性重写） |

### 包面（安装即可用）

| 项 | 目标 |
| --- | --- |
| exports | `./level0` … `./level6` 七键（`.` = level6 聚合）· **旧键全部删除** |
| bin | `weifuwu-showcase` · `weifuwu-platform`（→ `dist/level6/apps/*/cli.js`——应用启动器） |
| files | `dist/` + `README.md` + `docs/` + 应用运行资产（public/skills 等——随 dist 打包策略定） |
| 运行依赖 | `esbuild`（已有）· `graphql`（装备面）——**DB 驱动零外部**（自研 PG v3 / RESP2 引擎）· 依赖面已收敛（前置清理完成） |
| 应用测试 | 根脚本 `test:showcase` / `test:platform`（路径指向 level6 应用目录）· docker-gated 沙盒测试保持 |

### 命名去 core（全链）

| 旧 | 新 |
| --- | --- |
| `src/core/**` | `src/level0..4/**` + `level5` 装备 + `level6` 装配/应用 |
| `scripts/core-levels.mjs` / `core-graph.mjs` / `core-snapshot.mjs` / `core-audit.mjs` / `audit-core-semantics.mjs` | `scripts/level-map.mjs` / `level-graph.mjs` / `level0-snapshot.mjs` / `level-audit.mjs` / `audit-level-semantics.mjs` |
| `src/core/levels.json` · `scripts/core-levels-baseline.json` · `scripts/core-l0-snapshot.json` | `src/levels.json` · `scripts/level-map-baseline.json` · `scripts/level0-snapshot.json` |
| `npm run core:levels` / `core:snapshot` / `audit:core-levels` / `test:core` | `level:map` / `level0:snapshot` / `audit:levels` / `test:levels` |
| `docs/core.md` | `docs/level.md` |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| **W0 清点与规则**（无文件移动） | ① 分类器重写：scope = 全库（`src/**` + `apps/**` 非测试 + Go 资产登记；测试随目录安置不参与约束）；输出 `src/levels.json`（`{ files: path→{level,env}, shims: path→target }`）+ baseline；② shim 位点登记（迁移时删——不再生成）；③ DOM 闭包固化（种子+闭包规则入库，非清单硬编码）；④ 脚本/命令/文档更名去 core；⑤ **迁移重写器**交付（映射表生成 + 解析式 import 重写 + dry-run 报告） | 清单 100% 分类（`unknown=0`、shim 全登记、闭包 16/55 复算一致）；注入探针（未登记文件/越级依赖）= 红；重写器 dry-run 覆盖全库 import 零未解析；`test:levels` + `audit:all` 十四线绿 |
| **W1 框架面迁移**（原子 commit） | ① core 116 → level0..4；② 装备 → level5（含 sandbox Go）；③ 19 入口 → level6 聚合面；**全库 import 一次性重写**（src+apps+test）；旧路径删除 | `test:levels`+`test:client`+`test:server`+`test:scenario`+`test:showcase` 绿 · `tsc` 0 · `audit:levels --check` 绿（apps 此时仍用旧 specifier → 需在 W2 前保持可运行？→ **见风险表：W1/W2 合批或 W1 内先重写 apps 相对导入**） |
| **W2 应用内化** | apps → `level6/apps/*`；package.json 解散（scripts 并入根 · node_modules 符号链接删除）；`.env` 路径、Go 构建路径、playwright 路径修正；测试命令迁根 | 平台 **507（352+155）** 绿 · showcase **336** 绿 · `audit:all` exit 0 |
| **W3 包面开放** | 七 exports + 两个 bin（应用启动器）+ files（含应用资产）+ dist 构建策略（应用编译/资产——依赖面已达标：deps = esbuild + graphql）；外部安装冒烟 | `npm pack` → 临时目录安装 → `import('weifuwu/levelN')` 七键解析 + **`npx weifuwu-showcase` 起服 curl 200** + `npx weifuwu-platform` 起服（最少依赖） |
| **W4 审计七级化 + 加锁收尾** | `audit:levels` 方向/环境/三方/规模/docs 漂移 + level0 快照；`audit:all` 接入；`docs/level.md` 生成；AGENTS/规则并入；迁移指南（外部消费者——破坏性变更说明）；计划归档 | 注入探针红；全量回归门绿；计划文件删除（git log 承接） |

> **迁移重写器**（W0 交付——设计要点）：
> ① **映射表**从 `levels.json` 生成（规则投影，非手写清单）：`src/core/l0/** → src/level0/**` 等；
> ② **import 重写**＝解析式：相对 specifier → 源文件绝对路径 → 查映射 → 新相对 specifier（保留 `.ts` 扩展与 type-only 形态）；
> ③ 裸 `weifuwu` specifier（apps 内 275 处）= 查 exports 映射 → 新相对路径；
> ④ newline/quote 风格保持（逐行替换非全文件重排）；
> ⑤ dry-run 输出三桶：可重写 / 未解析（旧路径消失）/ 例外（node: / 三方）——未解析必须 0。
>
> W1/W2 批次边界（W0 定稿）：**W1 单原子 commit 完成全部搬家 + 全库 import 重写**（框架 + 装备 + 入口 + apps + 测试——无 shim 时中途态不可绿）；W2 只做包解散（package.json/scripts/bin/node_modules 符号链接）。

## 判负记录（可被新论证推翻）

- **不做 shim**：用户决策（一次性重写）——推翻条件：外部消费者反馈需要过渡期 → 另开"兼容过渡"波次（不是现在）。
- **apps 纳入包并导出**：用户决策——推翻条件：应用依赖/资产显著污染框架包或启动体感差 → 拆回独立包（保留 level6 应用目录即可拆）。
- **旧 exports 键不保留**：与"无 shim"同源——推翻条件同第一条。
- **level5 不再分层**：装备是同层兄弟——推翻条件：装备出现成链依赖且审计需要。
- **边界争议登记制**：闭包判定争议文件逐条登记理由（预期 <5%）；>5% 重审闭包口径。
- **不新增自研 DB 引擎**：已经是自研（PG v3 / RESP2 在 `src/server/db/**`，真实 docker 测试覆盖）——不是计划项。推翻条件：specifier 扫描发现 `postgres`/`ioredis` 真实调用（当前 = 0）或自研引擎在真实库上暴露协议缺口。
- **CSS 解析不用外部件**：postcss 删除（测试解析器→内部 `css-parse.ts`，全 CSS 语料 168 对账等价 0 差异）——推翻条件：内部解析器在新增 CSS 语法面暴露解析缺口。
- **WS 差分基准不保留**：`ws` 包与 adapter 删除（替代 = Autobahn 301 + native 向量 + Node 全局 WebSocket/undici 互操作）——推翻条件：需字节级双实现对账（可临时装回复跑）。

## 执行实录（边做边记）

**前置依赖清理（计划外——2026-09，为单包化铺路）**：
- `4d03736f` postgres/ioredis 死依赖删除（自研 PG v3/RESP2 已在位；32 针对测试绿）
- `8ca43ce0` tailwindcss/postcss/@tailwindcss/postcss 清理（`ctx.ui.css` 编译支路删；测试解析器→内部 `css-parse.ts`，postcss vs 内部 168 语料等价 0 差异；test:client 515 绿）
- `5d34e520` puppeteer-core/@graphql-tools/schema/ws 清理（ws adapter 与 200 用例差分测试删除→undici 互操作；test:server 881+1skip 绿）
- `796915de` @types/node ^25→^26.5.1（对齐运行时 Node v26.7.0）
- `a5113738` peerDependencies 三件删除（幽灵 API 面）
- 结果：deps = `esbuild` + `graphql` · devDeps = `@types/node` + `playwright`

**W0（进行中）**：探针读数：src 658 非测试（116/124/19/395/4）· apps 155 非测试 + 237 测试 · Go 5。

（W0 起逐波记录：迁移文件数/回归数字/意外）

## 验收标准

- [ ] W0：全库清单 100% 分类（含 apps/Go/资产）；重写器 + 脚本命令更名完成
- [ ] W1：框架面迁移完成；全库 import 重写；无 shim；五域回归 + `tsc` 0
- [ ] W2：apps 内化（包解散）；平台 507 + showcase 336 + `audit:all` 绿
- [ ] W3：七 exports + 两 bin；`npm pack` 安装冒烟（两应用可启动）
- [ ] W4：`audit:levels` 加锁（快照/规模/漂移/方向）；`docs/level.md`；计划归档
