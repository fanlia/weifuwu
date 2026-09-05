# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> 文档即代码：计划写作规范见 [plan/plan.md](plan/plan.md)（计划完成后
> 规则并入本文档——历史过程由 git log 承接）；组件编写规范见
> [docs/client.md §5](docs/client.md#5-组件编写规范唯一入口)；用户文档见
> [docs/client.md](docs/client.md) / [docs/server.md](docs/server.md)。

**防线快照（2027-xx）**：
契约 **433** · 场景 **123** · showcase **328**（134 组件全覆盖）· server **740** ·
shared **25** · 平台 **449** · audit:all **七线** exit 0（semantics/interactivity/vdom/theme/api/
bundle/showcase）· fuzz 对账 **1310 对**（静态+组件——终态等价 0 不等价）· tsc **0 错**。

**内核资产**：
- **vdom**（`src/client/vdom/`）——命令流引擎（13 命令 NDJSON 自足）+ 三实体状态机
  + 双树对账器 + fuzz 生成器 + render-health 四轴仪表
- **外部依赖内存化矩阵**（四类核心依赖——Memory 实现 + Server 协议替身双层——主包全导出）：

  | 依赖 | 真实实现 | Memory 实现（契约直实现） | Server 协议替身 |
  | --- | --- | --- | --- |
  | postgres | `postgres()` | `MemorySql`/`createMemorySql()` | `MemoryPostgresServer`（PG v3 **线协议**——TCP——PgPool 零改直连） |
  | redis | `redis()` | `MemoryRedis` | `MemoryRedisServer`（RESP **线协议**——TCP） |
  | ai | `OpenAi` | `MemoryAi`（onChat/onEmbed/onImage/onVideo 决策注入） | `MemoryAiServer`（OpenAI+dashscope 兼容 HTTP——`respond` 注入/`requests` 记录） |
  | email | `email()`（HTTP API） | `MemoryEmail`（onSend 注入 + sent 记录） | `MemoryEmailServer`（Resend 兼容 HTTP——`respond`/`requests`） |

  → 测试铁律：**自建 fake server 禁止**（createServer 归零）——全走 Memory 系 Server
  （决策注入 onXxx + respond 故障注入 + requests 断言）；Server 正名构造
  （`new MemoryAiServer()`/函数调用/`createXxx` 别名三入口等价）；db 系 Server 是
  线协议替身（无 HTTP 面——客户端连 TCP 真协议）
- **ai**（`src/server/ai/`）——AIInterface 契约 + provider 正门构造（new OpenAi/new
  MemoryAi——返回模块：中间件 + 全能力直接调用）+ 多模态（image/video 独立
  配置——同 embedding 平级——多 url 多 key）+ MemoryAiServer 协议替身
- **shared/router**（`src/shared/router/`）——**前后端唯一共享模块五层单源**
  （trie/pipeline/context/chain/ctx-fields）
- **workflow**（`src/server/workflow/`）——声明式执行引擎（表达式求值器/edge 去重状态机/步骤注册表/执行器——零运行时外部依赖）
- **server/core**（`src/server/core/`）——Router（自研 Trie）/serve/WS hub + 错误去重计数
- 计划规范：`plan/plan.md`——如何写计划（模板/纪律/收尾）——进行中计划
  在 `plan/` 根；完成计划不物理保留（git log 承接）

---

## 1. 测试命令纪律

| ID | 规则 |
| --- | --- |
| R-01 | **测试命令 timeout ≤ 10s**——卡住用更短 timeout 复跑缩小范围（超时即信号，不无限等待） |
| R-05 | **平台 orm 回流防线**——`node scripts/audit-orm-migration.mjs`（baseline 0——新增 `sql\` 模板即红；判负面白名单 `// orm-pg-*`/`// orm-upsert-expr`——审计可见不静默） |
| R-06 | **shape 防漂移守卫**——`npm run check:shapes`（apps/agent-platform——DDL 列集 vs SHAPES 逐表 diff——新增列必须补 shape——缺列报错+模板；CI 可挂） |
| R-04 | **小步快跑·单变量探针**——探针最小化（一个假设一个输出）· 单变量×干净环境（端口级杀共享 server `lsof -i:<port> -t \| xargs kill -9`——ps grep 匹配不全）· 探针 API 逐字复刻被测代码（`locator('button', {hasText})` vs `page.click(sel, {hasText})`——后者运行时忽略——API 不一致=复现无效）· catch 吞错必须打印（`catch(e => console.log('[x]', e))`）· CSS `:has-text` 是 includes 语义（用精确正则 `^\s*批准\s*$`） |
| R-03 | **批量重命名/迁移**——词边界替换负向断言 `(?![a-z0-9-])`（前缀误伤防护）· 类名变更反查测试 `[class*="子串"]` 选择器（R-03 反查纪律见 docs/client.md §5.8） |

## 2. 测试架构

```
npm run test:client    → 契约层（428——node 直跑命令流——零浏览器——~5s）
npm run test:scenario  → 场景层（123——SSR 服务化 + playwright——真实浏览器）
npm run test:showcase  → showcase 组件测试（324——134 组件——每组件一文件）
npm run test           → 契约 + 场景 + server（db 真库依赖 docker）
```

### 契约层（src/test/contract/——node:test 直跑）

原理：引擎决策层（build/diff/transform）输出 `Command[]`——纯数据——断言
命令流（id/顺序/语义）——零浏览器。关键文件：`vnode/transform`（h/jsx）、
`component-harness`（组件契约脚手架——mount/render/createTable）、`effect-guard`
（渲染路径副作用守卫）、`build`（首帧命令序列）、`diff`（setProp 只发变化键/
组件复用/空洞互换）、`key/keyed/attrs`、`router/store/data/html`、`events`、
`api`（真实 HTTP fixture）、`auth`、`ai-stream`（wf: SSE）、`layout-inventory`
（布局层清单 8 断言——计数基线/死类=0/缺口=0/无非法选择器/零值形态唯一/
方向词隔离/双名歼灭/文档计数同步）。

### 场景层（src/test/scenario/——playwright 真实 DOM）

weifuwu 自举：`server.ts`（Router + ui 中间件——/scenario/:id 页面 + /api/chat
NDJSON fixture + /ws fixture——port 0 随机）+ `main.tsx`（uiServe 收养）——
断言真实 DOM：childNodes 恒定/引用 ===/portal 归属。
场景：hole-placeholder · component-reuse/keyed-reorder · portal-toggle ·
diff-update/events-rebind/fragment-expand/ref-lifecycle · navigate · ssr-adopt ·
hooks 全契约（use-external/media/popup/chat/scroll/in-view/drag-drop）·
popup-placement/close-switch/hover/controlled-none/presence/mask/trap ·
toast-fire/confirm-command · use-controlled/breakpoint/tween/drag ·

### showcase 组件层（apps/showcase/test/comp-<id>.test.ts）

每组件一文件（134 文件）——`showcase-shared.ts` 提供 startShowcaseServer（随机端口）
/openShowcase（错误收集）——断言纪律：弹窗类断言"在哪"（坐标关系——assertPopupGeometry
非"在视口内"弱断言）；表单类断言值回流（onChange→props→显示同步）。
覆盖哨兵：`scripts/audit-component-coverage.mjs`（组件×三层矩阵——零覆盖=缺口
exit 1——CI 可挂）。

### 平台 e2e 层（apps/agent-platform/test/——route 契约纪律）

协议层测试（memory orm + handler 直调零浏览器）→ UI 层（playwright 真 server
`POSTGRES_MEMORY=1`）。**新 route 必带契约测试**——模板复制即用：
`apps/agent-platform/test/_template.contract.ts`（5 行核心：memory orm →
handler 直调 → 状态码断言）· route 覆盖哨兵：`npm run audit:routes`
（黄报未引用清单——新 route 无测试 = 可见）。

## 3. 组件作者契约（精华——完整检查清单见 docs/client.md §5）

> 一条规则：工厂**同步**（async 即编译错）；异步边界**全在 hooks**；渲染**纯同步**。

```ts
type Component<P, C> = (initProps: P, ctx: C) => RenderFn<P>  // 同步工厂
type RenderFn<P> = (props: P) => VNode | null | (VNode | null)[]
```

- 数据加载 → `ctx.ui.useAsyncData(fetcher, key)`（并发合并/竞态取消/缓存保留/
  卸载自动退订/SSR 种子命中）
- 状态 → `ctx.ui.signal(0)` / `useObservable(obs$)`——**getter 纪律**：一切变化值
  `() => T`——任意位置读最新
- 清理 → `ctx.ui.hold(fn)`；事件回调内 await 合法（渲染无关）；工厂期禁

## 3.5 orm 架构纪律（2027-xx——状态机管理原则）

> **orm = shape + operator + adapter**——三个组成部分的内部状态都是确定的，
> 采用**状态机管理**方式处理：透明（状态可查询）· 可控（转换点唯一·非法转换
> 显式拒绝）· 健壮（行为矩阵替代隐式 if——无隐藏分叉）。

- **shape**：单态冻结（构造即终态——不可变）；平台 shapes 唯一合法形态
  `satisfies ZodRawShape`（**禁止** `: ZodRawShape` 注解——Infer 坍缩根因）；
  行类型单源派生 `RowOf<SHAPES.xxx>`（禁止手动双写接口）
- **operator**：无状态纯函数（定义即值——同一输入恒同输出）；值形态唯一
  （`{ eq: v }`/`{ in: [...] }`/`{ isNull: true }`——**禁止裸标量/数组/null**
  ——旧的数组/`= NULL` 歧义已解除）；`{ eq: null }` 语义 = IS NULL（双端一致）
- **adapter**：真状态机——MemoryTable 状态
  `absent →(applySchema/executeDdl) declared →(insert) populated` 与
  `absent →(insert 直建) observed`——行为矩阵按状态分发：
  declared=声明列集校验+columnTypes 解码 · observed=行键事实+行键值启发解码 ·
  observed 上 DDL 拒绝（显式对齐才允许）——`inspectTable()` 状态可见
- **一致性铁律**：同一声明/同一算子在任何 adapter 行为等价——**不一致即 bug
  修复而非登记**；无法一致的（事务 memory no-op/FK 无 memory 面/vectorScore
  浮点精度）显式声明（文档+契约标注）；**声明了但无行为 = 不透明 = 定案**
  （实现或移除——softDelete 先例：零行为 → 判负移除）
- **单源**：同一逻辑列的声明只允许一处（禁止 DDL 面/shape 面双写——enum/
  vector 双源违规已修）
- **协议层**：业务/测试禁止 SQL 文本面（sql 模板/unsafe/whereRaw 已全链消亡
  ——audit-orm 三域 0 防回流）——唯一数据入口 = ORM AST 面
- **盲区警惕**：fuzz 对账全绿 ≠ 行为一致——确定性审计必须覆盖生成器盲区
  （`eq:null`/jsonb 解码路径/状态转换路径——盲区先补测再信绿）

## 4. 复用与修复纪律（先查库再写——排查先归类）

### 4.1 复用纪律（写功能前先查 weifuwu 已有能力——前端/后端 30 秒成本）

> **开发任何新功能前，先查库再写**（前端 30 秒 / 后端 30 秒——成本远低于重复发明与后续对齐）：
>
> **前端**：`ls src/client/components/` + [docs/client.md §2 组件清单](docs/client.md#2-组件清单)。
> **后端**：`ls src/server/` + [docs/server.md](docs/server.md) 服务端地图（工作流引擎/steps 注册表/scheduler/messager/email/queue/ai）——
> 已有能力即复用：cron 触发复用 scheduler、步骤编辑复用 `views.ts` 纯函数（patch/insert/remove——UI 零逻辑）、
> 版本快照复用既有 VERSIONS 表 + crud、引擎新增步骤类型前先看 steps.ts 既有（http/template/log/if/ai/email）。
> 后端行为规范读单测即得（默认参数/边界/异常签名——如 **HttpError(message, status)** 顺序反直觉、select rest 参数展开）。
>
> 判别标准：组件通用（>1 消费者）→ 入库；单一消费者 → 平台层；无现成 → 零依赖自研（判负必须登记）。
>
> **复用记录**（产品周期实证——先查后写的正反馈）：
>
> | 新功能 | 复用/判负决策 |
> | --- | --- |
> | CodeEditor 语法高亮 | 复用 CodeBlock/highlight.ts `tokenize`（零新代码） |
> | 版本回滚 diff 预览 | 复用 DiffView（行级 LCS——old/new 字符串即用；自写 def diff 函数判负） |
> | 添加步骤 Modal/类型选择 | 复用 Modal + Select 组件（prompt() 弹窗升级） |
> | 步骤增删/编辑 | 复用 views.ts 纯函数（UI 只发 patch——逻辑单源在 server） |
> | cron 定时触发 | 复用 scheduler tick；cron 解析器零依赖自研（无现成——判负登记） |
> | CronPicker（cron UI） | 判负：组件库无通用 cron 控件（enum 语义不符）——平台层暂存，等第二消费者入库 |
> | 版本快照/回滚 | 复用既有 VERSIONS 表 + crud（wfjs 派生重渲染——不存冗余） |

### 4.2 修复归类纪律（排查先归类——根因优先核心层）

```
问题 → 归类：应用层（demo/示例错）？组件层（组件实现）？核心层（引擎）？
  → 组件层异常先查是否核心层根因（引擎 bug 透过组件暴露）——是 → 修核心
  → 核心层修复 → 必写契约测试（命令流断言）→ 全库回归
```

**机制化优先**：能进审计/契约的纪律不靠记忆——红线表见 docs/client.md §5.6
（isHoleKind/isTextKind 单源 · 空串=空洞 · 事件不进 attrs · value 走 property ·
aria 布尔归一 · 受控回流门控 · 状态变体类必须定义 · 零全局 window/document）。

**核心层关键机制**（历史修复实录——git log 可追溯）：
- 空字符串 = 空洞（编码唯一性——kindOf 单源）
- 组件输出判别联合（null/数组/组件 → compId 子空间——sink 特判 + outputBase 同步）
- 重复 key 三面修复（首现优先/多余项区间移除/move remap 迁移注册表）
- keyedId key 转义（'%'/'．' 转义防前缀误删兄弟实例）
- 消费端三表索引化（childIds/byChild——O(N²)→O(k)）
- Segment.epoch 纪元（cleanup 只处置旧树段——nav 链残留根因）
- SSR 吸收（DFS 序游标结构对齐——mismatch 原子回退）

## 5. 质量方法论（五阶段）

1. **探针实证先于计划** — 一次性探针脚本（/tmp/*.ts——不复用不提交）读数现状；
   缺口登记常被重定位（探针后可能已解决/更严重）——探针读数是基线锚点。
2. **波次推进** — 每波次闭环：实现→契约→回归门→commit（不跨波次欠账）；
   回归门先行（fuzz/契约防线建在重构之前——对账器保护下才动手术）。
3. **fuzz/对账防线** — 参考世界（build new）vs 模拟世界（build old + diff）终态
   等价——多种子（≥5）× 大样本（≥200 对）；抓到不等价=人工甄别（都修单源）。
4. **判负文化** — 启发式误报>30% 判负；重构收益不明判负；判负必须登记
   （为什么/替代方案/推翻条件——docs/client.md#能力裁剪登记）。
5. **全量回归门（批次末）** — 契约+场景+showcase+server+shared 五域全绿 +
   audit:all 七线——**任何红 = 不 commit**。

## 6. 已知边界（诚实裁剪）

- 渲染队列 FIFO/redirect：serve 内部机制——间接覆盖（无专门测试）
- 高频输入页每键全页 renderFn 成本：页面 state 每键变化 → 全树重建（memo
  opt-in 已可跳过段级 diff——页面级 renderFn 为架构性成本——局部 state
  原语为可能的演进方向）
- 测试竞态：场景层 3 文件并发（每文件独立 server/browser）——文件内串行

> 2027-09 清理：keyed 组件顺移（删头前移）状态丢失——**已修复**（2027-10
> M2 物理 move 收口——KEYED-COMPONENT-MOVE——key-inject 契约 3/3 绿——
> 原「正解待实现」登记（fuzz D5）随修复存档于 git 历史）。

## 7. agent-platform 依赖服务（仓库根 docker-compose.yml——唯一 compose）

> agent-platform **无独立 compose**（原 apps/agent-platform/docker-compose.yml 已删——
> 2026-09 收敛）。依赖栈 = 仓库根 [docker-compose.yml](../docker-compose.yml)：
>
> | 服务 | 镜像 | 宿主端口 | 默认连接（对齐 .env.example） |
> | --- | --- | --- | --- |
> | postgres | `pgvector/pgvector:pg18`（**含 vector 扩展**——知识库必需） | 5432 | `postgres://root:123456@localhost:5432/demo` |
> | redis | `redis:7-alpine` | 6379 | `redis://localhost:6379` |
> | smtp | greenmail（测试邮箱） | 3025 | 本地收发件 |

**开发/测试惯例**：仓库根 `docker compose up -d postgres redis`（不 build app——
应用本体宿主 `node --env-file=.env server.ts` 跑）；备份/恢复直连宿主端口
（`-h localhost -p 5432 -U root demo`——不再 `compose exec`）。

**测试注记（探针实证 2026-09）**：契约测试默认
`TEST_DATABASE_URL ?? postgres://root:123456@localhost:5432/demo_{域}_test`（视频域：`demo_video_test`）——
同一 weifuwu-postgres-1（vector 就绪）。需镜像化时用 Dockerfile 自建 + `--network host` 连本栈。
