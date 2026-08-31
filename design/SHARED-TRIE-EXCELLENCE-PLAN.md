# SHARED-TRIE-EXCELLENCE-PLAN——前后端唯一共享模块优化（2027-10）

> **定位**：`src/shared/router/`（trie.ts 216 行）是前后端**唯一共享
> 模块**——server Router 与 client UIRouter 的共同匹配核心——语义正确性
> 影响面最大。ROUTER-CORE A3 fuzz 已在此修复 3 轮缺陷（回溯缺失×2/
> want 丢失）——本计划把「共享模块该有的守护位」补齐。
>
> **探针实证（2027-10）**：
> - **前端 URIError 裸抛**：server 已修 400（C3）——**前端 UIRouter.resolve
>   未同步**——`/u/%zz` 导航 URIError 直接抛到渲染层（双端一致性缺口实锤）
> - **测试归属错位**：shared 模块**零自有测试**——A3 fuzz/语义锚点寄生在
>   server/core/router-contract.test.ts——单一实现源的守护位应在 shared 域
> - **死代码**：`matchChild`（fallback 重构后零调用）、`wildcardFallback`
>   的 `_params` 未用参数、根路径分支与 exactDfs 逻辑重复
> - **API 冗余**：`trieRegister` 的 `isWildcardValue` 参数与函数内部
>   `path.includes('*')` 判定重复（server 调用方两处重复判定）
> - **注释过时**：client/vdom/index.ts「shared/router 核心提取——待」
>   （实际已提取——注释未更新）
> - **性能无基线**：fallback 逐 depth O(depth²) 上界未锁；shared 层裸 trie
>   基线（零 HTTP 噪声）未登记
>
> **双端重复面盘点（「前后端都收益」评估——2027-10）**：
> - **URL→segments 解析**：server handler()/client resolve()/client has()
>   三处 `new URL + splitPath`——且 **URIError 防御只有 server 有**（C3）
> - **query 注入**：serve.ts:59 与 client resolve 同式
>   `Object.fromEntries(url.searchParams)`——真实重复
> - **params fresh 注入**：client「每次渲染替换不残留旧路由键」（契约
>   锁定）——server 语义等价（ctx 每请求新建）——实现分散
> - **判负修订（2027-10 用户论证——两层区分）**：①**类继承式抽象
>   （RouterBase）判负维持**——强制双端 API 同构丢各自富面；②**机制级
>   共享（pipeline 流程骨架 + 差异钩子）成立**——handler 签名同构 +
>   流程 6 步中 3 步完全同构、3 步是差异点而非不同流程（parse/match/
>   params 注入单源化；chain/404/405/error 钩子化）——runChain 移
>   shared（前端获得 middleware 能力——机制就位）③ctx.route 注入
>   （client 独有——走 enrichCtx 钩子保留 client 域）
> - **可共享且双端收益**：`shared/router/context.ts`——parseRequestTarget
>   （URL→segments + URIError 400 信号——双端统一）/freshParams（防残留
>   克隆）/parseQuery（searchParams 提取）——B1 载体升级

---

## 波次 A：测试归属归位 + 死代码清理

### A1 shared 域测试（单一实现源守护位）
- 新建 `src/shared/router/trie.test.ts`（node:test——shared 域首测试）：
  - **A3 fuzz 迁入**（8 种子 × 200 对——线性扫描参考模型——匹配语义
    终态等价）
  - **语义锚点迁入**（浅通配优先 / param>通配 / 静态首段贪心 /
    param 冲突抛错 / 通配独立槽 / 精确优先标记 `'*': ''`）
  - server 侧契约保留（消费端集成面——**双保险不删**）
- A2 死代码清理：matchChild 删除（fallback 重构后零调用）、`_params`
  残留参数删、根路径分支统一 exactDfs（`exactDfs(root, [], 0)` 天然
  处理空段——**纯等价，fuzz 回归门**）

## 波次 B：前端防御 + 双端一致性（唯一共享模块的双端契约）

### B0 shared/pipeline.ts 路由内核（**机制公用、实现不一样——核心抽象**）
- `RouterPipeline<TValue, TCtx>` 接口：resolveHandler（route 闭包/
  not-allowed 分类）/ onNotFound / onMethodNotAllowed? / onError? /
  enrichCtx?——**双端差异点全部钩子化**
- `dispatchRouter(root, pipeline, req, ctx)`：parse → trieMatch →
  params fresh 注入 → resolveHandler → try run / onError → 404/405 兜底
  ——**流程骨架单一实现源**（改一处双端生效）
- `runChain` 自 server/core/chain.ts 移 shared（前端获得 middleware
  能力——机制就位）
- **双端类 API 零变化**：Router.handler() / UIRouter.resolve() 内部
  换 dispatchRouter——405/Allow/去重收敛 serverPipeline；route 注入/
  前端 404 收敛 clientPipeline
- 验收：fuzz 8 种子 + server 163 契约 + client 契约全绿（内核换血
  ——防线已就位）

### B1 shared/context.ts 新模块（**双端接入——前后端都收益**）
- 新建 `src/shared/router/context.ts`（请求目标解析 + ctx 注入纯函数）：
  - `parseRequestTarget(req)` → `{ ok, segments, pathname, query }` |
    `{ ok: false, reason: 'malformed-encoding' | 'invalid-url' }`
    （**URIError 防御双端统一**——server C3 逻辑迁移至此）
  - `freshParams(match)` → params 克隆（不残留旧路由键——client 契约语义
    单一实现源）
  - `parseQuery(url)` → searchParams 提取（serve.ts:59 与 client 同式收敛）
- **接入点 4 处**：server handler()（URL 解析 + 400 信号——C3 try-catch
  简化）/ server serve.ts:59（query）/ client resolve()（解析 + params/
  query 注入 + **URIError → 400 Response——前端防御修复**）/ client has()
- 契约：前端非法编码 400 + 正常/多重编码 decode 锁定 + server 400 不回归

### B2 双端对账契约（GET 匹配共同面）
- **同 Trie 操作序列**（注册集 + 请求集）→ server Router 消费 vs
  client UIRouter 消费——**分类等价**（命中 handler 标识/params/404
  ——method 表为 server 独有，锚定 GET 共同面）
- 价值：**前后端语义漂移的结构性防线**（共享模块变更时双端同时验证）

## 波次 C：性能基线（shared 层裸 trie——零 HTTP 噪声）

- C1 裸 trie 10k 注册/匹配基线（探针读数登记——Router 层基线的
  下界参照）
- C2 fallback O(depth²) 上界锁：逐 depth exactDfs——depth ≤ 实际
  路径段数（≤8 常态）——最坏 ~64 次 DFS——微秒级；基线锁防退化

## 波次 D：API 面收敛（纯收紧）

- D1 `isWildcardValue` 冗余参数评估：path 含 `'*'` 时函数内部已走
  wildcardValue 分支——参数仅在 path 不含 `'*'` 时生效（第三态）——
  **验证 server 调用方 isWildcard === path.includes('*') 恒真后删**
  （调用点 2 处更新——纯等价收紧；若发现第三态真实消费——判负保留）
- D2 公共 API 面锁定：client/vdom/index.ts 过时注释更新
  （「核心提取——待」→ 已提取）+ shared 导出面契约（trie.ts 六 API +
  context.ts 三 API——导出清单测试锁定）

---

## 验收判据（红线）

1. shared 域测试成立（fuzz 8 种子 + 锚点全绿——守护位归位）
2. B1 前端 400 语义 + B2 双端对账等价（双端一致性结构性防线）
3. C 基线登记（裸 trie 注册/匹配/fallback 上界）
4. D 收紧后 tsc 0 错 + 消费面（server/client）全绿
5. 全量回归门：契约+场景 123 · showcase 320 · server 163 · audit:all

## 风险与回退

| 风险 | 缓解 |
|---|---|
| 根路径分支统一改语义 | fuzz 回归门（纯等价才合入——不等价立即回退） |
| isWildcardValue 删除破坏第三态消费 | 先验证调用方恒真性——发现真实消费即判负保留 |
| 前端 400 语义与 SSR/SPA 导航交互 | showcase 全量回归（导航场景覆盖） |
