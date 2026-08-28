# agent-platform AI 体验优化计划（2026-08 第四波——AI-EXPERIENCE-PLAN）

> 触发：用户要求「优化 AI 体验」——从真实聊天记录（部门 b6a993…——张明/小码/财务小王）
> 的**用户可见症状**出发，沿工具调用链路逐层定位，给出**从根因层面**的修复方案。
> 全部问题均有**实证**（真实聊天记录 / 代码证据 / 直接调用复现）——非臆测。

---

## 一、诊断结论（用户可见症状 → 根因 → 等级）

| # | 用户可见症状（实证） | 根因（已定位） | 层 | 等级 |
| --- | --- | --- | --- | --- |
| A1 | 知识库检索报错（AI 自述「知识库查询报错（工具问题）」——换 2 个关键词仍失败） | **skill 版 search_knowledge_base 用旧列 `tenant_id`**（2016 模型）——skill handler 覆盖内置同名工具——每次检索 `column "tenant_id" does not exist`（**已修复 f3e0a42f**——tenant_id→app_id + 对齐内置语义） | 应用 | ✅ 已修 |
| A2 | **工具失败前端无视觉区分**——UI 永远显示「完成」 | Chat.tsx `wf:tool_result` 处理**丢弃 `ok` 字段**——无论 ok=true/false 都标 `status: 'done'`（325 行）——框架事件已带 `ok: false + error.message`——**前端没消费**——工具失败用户看不见（导出也不标「失败」） | 应用 | **P0** |
| A3 | **失败答案入缓存**——「去 这个网址把问卷填写一下」缓存了**失败中间态**（访问 host.docker.internal 失败……）——后续同类问题命中返回失败记录 | chat.ts 写缓存（885-896）**只查 `shouldCacheQuestion`**（不含 @ 排除/失败信号排除）+ **答案质量无过滤**（`length >= 10` 即入缓存）——AI 失败回复也被缓存 | 应用 | **P0** |
| A4 | **缓存陈旧**——「订单.csv 有多少条数据」**命中 3 次**——文件内容变化后永远返回旧答案（2 条） | shouldCacheQuestion 只排除「我的 X」「时间词」——**文件/数据类问题命中缓存**——无时效失效机制 | 应用 | **P0** |
| A5 | **AI 回复双前缀**——「[小码] [小码] 收到！」 | persona 协作纪律「回复用 [对方名字] 称呼」——AI 在**自己回复**前也加 `[自己名]`——上下文里 [小码] 是发言者——AI 照抄上一轮格式——**无前缀规范约束** | 应用 | P2 |
| A6 | **缓存标注暴露内部信息**——「（来自缓存答案——同类问题已回复 3 次，零 token 消耗）」 | buildCachedReply 文案把「零 token 消耗」（成本/原理信息——用户不关心）拼进用户可见回复 | 应用 | P2 |
| A7 | **相似度极低也返回**——检索「AI 机器人 能力」返回 FAQ **4.7%**、产品介绍 **2.6%**（embed 随机向量对照） | search_knowledge_base 无相似度阈值/质量标注——低相关 chunk 也当「知识」返回——AI 可能引用弱相关内容 | 应用 | P1 |
| A8 | **embed 失败直接抛错**——AI 被迫换关键词重试（浪费 token + 用户等待） | search_knowledge_base 的 `ctx.ai.embed(query)` **无 try/catch 无重试**——embed 瞬时失败 → 整个工具失败——AI 误判「工具坏了」 | 应用 | P1 |
| A9 | **skill 与内置同类工具双实现漂移**（本波 A1 根因的土壤） | search_knowledge_base 在 builtin.ts + skill tools.ts **两份 handler**——本次 tenant_id 残留只在 skill 版——**单实现源纪律缺失**——未来漂移风险 | 应用 | P1 |
| A10 | read_csv 中文文件名失败（用户消息「改用 Python 直接读取」） | **已修复**（工作目录解析——`_toolDepartmentId` + resolveDepartmentWorkspace——2026-08）——复现验证 `ok: true` | 应用 | ✅ 已修 |

---

## 二、波次执行计划

### Wave 1：正确性（P0——用户可见误答/误导）

**B1 · 工具失败前端可观（A2）**
- 根因：`wf:tool_result` 未消费 `ok`
- 修复：Chat.tsx 325——`const tools = ... map(t => ...({ ...t, status: event.ok === false ? 'error' as const : 'done' as const, result: event.ok === false ? (event.error ?? event.result) : event.result }))`——失败显示错误原因
- 附带：导出 chat 已有 `t.status === 'error' ? '（失败）'` 分支（571 行）——修好后自动生效
- 测试：ui 场景（pages.test.ts 补齐）——模拟 `wf:tool_result ok:false` → 断言工具条 error 徽标
- **验收**：知识库检索失败时 UI 工具条红色「失败」——不再假装完成

**B2 · 失败答案不入缓存（A3）**
- 根因：写缓存无答案质量过滤
- 修复方案（两处）：
  1. chat.ts 写缓存前加 `isFailureAnswer(answer)` 检查——失败信号正则（`/无法|失败|报错|Error|未能完成|不能|不可用/`）→ 不写缓存
  2. `shouldCacheQuestion` 加 **@ 定向排除**（与读侧 922 行对称——读侧已排除 @——写侧漏了——**不对称**）
- 测试：answer-cache.test.ts 加 isFailureAnswer 单测 + 集成断言（@消息不出现在缓存）
- **验收**：问卷失败答案不再入缓存——后续同类问题走真实执行

**B3 · 缓存失效/时效（A4）**
- 根因：文件/数据类问题命中缓存——无时效
- 修复方案（选择——平衡收益/成本）：
  - **最小**：`shouldCacheQuestion` 加**文件/数据类排除**（regex：含 `.csv/.xlsx/.json` 等扩展名或「多少条/几行」数据查询词）——这类问题答案随文件变化——不缓存
  - **增强**（登记——可选）：缓存记录加 `expires_at`（如 24h 过期——通用问题也考虑时效）——**增幅小/收益不确定——先登记不做**
- 测试：answer-cache.test.ts——「订单.csv 有多少条」→ shouldCacheQuestion false
- **验收**：订单.csv 类问题每次真实执行——答案永远最新

### Wave 2：质量（P1——回复可信度/效率）

**B4 · KB 相似度下限 + 低相关标注（A7）**
- 根因：无阈值
- 修复：search_knowledge_base（builtin + skill——**统一到单实现源后一处修**）——过滤 `similarity < 0.3` 的 chunk；若全部过滤 → 返回「知识库中无高相关结果」而非返回低相关垃圾
- **注意**：阈值先实证校准（用真实 embed 查询相似度分布——0.3 是否误伤）——先加日志/度量再定阈值
- 测试：单测（mock embed + mock sql——低相似度被过滤）
- **验收**：AI 只引用高相关 chunk——不再出现 4.7% 的「相关结果」

**B5 · embed 失败降级重试（A8）**
- 根因：无 try/catch
- 修复：embed 调用包 `try/catch`——失败重试 1 次（瞬态）→ 仍失败返回「知识库检索暂不可用（Embedding 服务异常），请稍后重试或直接提问」——**不抛工具错误**（AI 有明确信息而非误判工具坏）
- 测试：单测（mock embed 抛错——返回降级文案）
- **验收**：embed 瞬时失败 → AI 收到中文提示继续对话——不再换关键词空转

**B6 · skill/内置工具单实现源（A9）**
- 根因：两份 handler
- 修复方向：**skill 只做声明（tools[]）——handler 统一委托内置/单一 registry**——或 skill handler 从内置导入复用（消除复制）
- 方案选择（执行时定）：
  - a) skill tools.ts 删 handler——注册时 `handlers: { search_knowledge_base: 内置 handler }`（SkillRegistry 支持 fallback 到全局 registry——检查 agent-runner 的 handler 查找链）
  - b) skill handler 保留但实现尽调复用一个共享模块（`src/services/kb-search.ts`——builtin + skill 都调它）
  - **推荐 b**（单一实现源——共享模块——两边薄）
- 测试：skill 加载后 handler 行为与内置一致（同一查询同一结果）
- **验收**：tenant_id 类漂移不可能再发生（一个实现源）

### Wave 3：打磨（P2——可读性/体验）

**B7 · 前缀规范（A5）**
- 修复：persona buildPersonaLayer 协作纪律加一条：**「你的消息不需要带 [自己名字] 前缀——系统已为你标注发言者身份——回复直接用正文」**
- 测试：persona.test.ts 断言 personality 文本含前缀规范（快照级）
- **验收**：AI 回复不再双前缀——正文干净

**B8 · 缓存标注用户友好（A6）**
- 修复：buildCachedReply 文案改为「（来自相似问题的快速回复——已回复 N 次）」
- 测试：answer-cache.test.ts 文案断言
- **验收**：不暴露「零 token 消耗」内部信息——用户看到友好标注

---

## 三、验证纪律（AGENTS.md 对齐）

- **真实聊天页验证**：修复后重发「@小码 请用知识库检索…」→ 观察工具条状态（B1）
- **缓存验证**：清缓存 → 发「订单.csv 有多少条」→ 不写缓存（B3）；失败回复不入缓存（B2）
- **回归**：框架 test:client（若有 core 改动）+ 应用 npm test（每波全绿）+ tsc 0
- **诚实裁剪**：B3 增强（expires_at）——先登记不做（收益不确定——现有时间词排除已覆盖大部分时效问题）；KB 阈值先校准后定（防误伤）

---

## 四、问题→修复映射（执行清单）

| 任务 | 问题 | 文件 | 状态 |
| --- | --- | --- | --- |
| B1 工具失败前端 | A2 | ui/pages/Chat.tsx | ⬜ |
| B2 失败答案不入缓存 | A3 | src/services/chat.ts + answer-cache.ts | ⬜ |
| B3 缓存时效 | A4 | src/services/answer-cache.ts | ⬜ |
| B4 KB 相似度下限 | A7 | src/services/kb-search.ts（新建）+ builtin/skill | ⬜ |
| B5 embed 降级重试 | A8 | src/services/kb-search.ts | ⬜ |
| B6 handler 单实现源 | A9 | skills + builtin + registry | ⬜ |
| B7 前缀规范 | A5 | src/services/persona.ts | ⬜ |
| B8 缓存标注 | A6 | src/services/answer-cache.ts | ⬜ |
