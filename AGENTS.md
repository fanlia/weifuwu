# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> 文档即代码：计划写作规范见 [plan/plan.md](plan/plan.md)（计划完成后
> 规则并入本文档——历史过程由 git log 承接）；组件编写规范见
> [docs/client.md §5](docs/client.md#5-组件编写规范唯一入口)；用户文档见
> [docs/client.md](docs/client.md) / [docs/server.md](docs/server.md)。

**防线快照（2027-xx）**：
契约 **428** · 场景 **123** · showcase **324**（134 组件全覆盖）· server **163** ·
shared **35** · audit:all **七线** exit 0（semantics/interactivity/vdom/theme/api/
bundle/showcase）· fuzz 对账 **1310 对**（静态+组件——终态等价 0 不等价）· tsc **0 错**。

**内核资产**：
- **vdom**（`src/client/vdom/`）——命令流引擎（13 命令 NDJSON 自足）+ 三实体状态机
  + 双树对账器 + fuzz 生成器 + render-health 四轴仪表
- **shared/router**（`src/shared/router/`）——**前后端唯一共享模块五层单源**
  （trie/pipeline/context/chain/ctx-fields）
- **server/core**（`src/server/core/`）——Router（自研 Trie）/serve/WS hub + 错误去重计数
- 计划规范：`plan/plan.md`——如何写计划（模板/纪律/收尾）——进行中计划
  在 `plan/` 根；完成计划不物理保留（git log 承接）

---

## 1. 测试命令纪律

| ID | 规则 |
| --- | --- |
| R-01 | **测试命令 timeout ≤ 10s**——卡住用更短 timeout 复跑缩小范围（超时即信号，不无限等待） |
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

## 4. 修复归类纪律（排查先归类——根因优先核心层）

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
- keyed 组件顺移（删头前移）状态丢失：重建路径工厂重跑——正解「输出锚物理
  move + ref 定位」待实现（fuzz D5 捕获实证）
- 测试竞态：场景层 3 文件并发（每文件独立 server/browser）——文件内串行

## 7. agent-platform 依赖服务（apps/agent-platform/docker-compose.yml）

> 私有化一键部署栈（三个服务——postgres/redis 是运行时依赖，app 是应用本体）。
> 开发态惯例：**只起 postgres/redis**（`docker compose up -d postgres redis`——不 build app）；
> 应用本体由宿主 `node --env-file=.env server.ts` 跑（watch 开发见 apps/agent-platform/package.json dev）。

| 服务 | 镜像/构建 | 关键事实 |
| --- | --- | --- |
| postgres | postgres:16-alpine | 用户 `agent`/`agent-pass-change-me`（PG_USER/PG_PASSWORD 可覆盖）· 库 `agent_platform`（PG_DB）· volume pg-data · 健康检查 `pg_isready` · **无宿主机端口映射**（仅 compose 网络内——app 经 `postgres:5432` 访问；宿主直接查库用 `docker compose exec postgres psql -U agent agent_platform`） |
| redis | redis:7-alpine | `--appendonly yes`（AOF 持久化）· volume redis-data · 健康检查 `redis-cli ping` · **无宿主机端口映射**（app 经 `redis:6379`） |
| app | monorepo 根 build（Dockerfile: apps/agent-platform/Dockerfile） | depends_on 两依赖 healthy · 必配 env `JWT_SECRET`/`DEEPSEEK_API_KEY`（`${VAR:?}`——缺失启动即 fail）· `DASHSCOPE_API_KEY` 空则图片/视频工具不可用 · 端口 `${PORT:-3000}:3000` · volume workspace-data:/data/workspaces · 挂 `/var/run/docker.sock`（沙盒）· 健康检查 `GET /healthz` |

**调试速查**：`docker compose logs -f app`（启动日志）· `curl http://localhost:3000/healthz`（健康）·
`docker compose config`（展开 env 缺省看最终值——before 排查 `${VAR:?}` 必填报错）。

**测试注记（探针实证 2026-09）**：**仓库根 docker-compose.yml** 才是开发/测试基础设施——
`weifuwu-postgres-1`（pgvector/pgvector:pg18 · 宿主 5432 · root/123456 · 库 demo + demo_*_test——含 pgvector 扩展）·
`weifuwu-redis-1`（redis:7-alpine · 宿主 6379）· `weifuwu-smtp-1`（greenmail · 3025）；
age-platform 契约测试默认 `TEST_DATABASE_URL ?? postgres://root:123456@localhost:5432/demo_{域}_test`
（视频域：`demo_video_test`）。agent-platform compose 的 postgres（agent 用户、无 pgvector）与
redis（无宿主端口）**只承载部署运行时，不替代测试基础设施**——app 在其中启动前
需换 pgvector 镜像（`extension "vector" is not available` 实证）。
