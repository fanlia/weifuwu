# AI-REBUILD AI 接口重构（2027-10）

> 目标：AI 能力面（语言/嵌入/图片/视频）统一为 `AIInterface`（参考 PostgresInterface 分层），
> 新增 `MemoryAi`（参考 MemorySql——契约直实现）与 `MemoryAiServer`（参考
> MemoryPostgresServer——协议替身——测试用），`ai({ provider })` 工厂插槽。
> 动机：① 消费证据——AI 能力劈两栈（语言=DEEPSEEK 在框架 ai/；多模态=DASHSCOPE
> 在 agent-platform tools/image-gen+video-gen）——换 provider 两处动；② 对话
> 生成→执行链 e2e 缺"确定性 LLM 决策层"（chat.test.ts 明确裁剪"不进真实 LLM"）。

## 现状探针（已读）

- `ai/` 契约：`Ai` 接口 9 方法（contracts.ts）+ `AiClient`（client.ts——OpenAI 兼容 HTTP）
  ——`AiClientModule extends Middleware+Ai`（index.ts）——Context.ai 声明在 index.ts（未与接口同居）
- 消费面：主包导出 `Ai`/`AiClient`/`AiClientModule`/`ai()`——agent-platform `ctx.ts` 用 `AiClientModule`
- 图片：`tools/image-gen.ts`（99 行）dashscope 多模态同步（`DASHSCOPE_MAAS_API_URL` z-image-turbo）
- 视频：`tools/video-gen.ts`（311 行）百炼异步任务——提交+DB 任务行+队列 worker 轮询+保存 /ws
  （**编排属应用层**——provider 面只包提交/查询）
- postgres 对照三层：types.ts（接口+Context 声明同居）/ client.ts（工厂 OPAQUE 组装）/
  db/postgres（引擎）——memory 双档：MemorySql（593 行契约直实现）/ MemoryPostgresServer
  （625 行协议替身）

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | contracts.ts：`Ai` → `AIInterface`（正名+兼容别名）+ 多模态 3 方法（generateImage/createVideoTask/videoStatus）+ Context.ai 声明搬入 | tsc 0 |
| W2 | client.ts：`AiClient` 扩 3 方法——dashscope 多模态 HTTP（搬 image-gen 直调面 + video 提交/查询面） | tsc 0（现有 ai.test 绿） |
| W3 | memory.ts：MemoryAi 补多模态（占位图/立即 done/注入 onImage/onVideo）——chat 面已写 | 新单测（占位契约——见 W7） |
| W4 | index.ts：`ai({ provider })` + `AI_PROVIDER` env 分支 + 新导出（AIInterface/MemoryAi/MemoryAiServer）——默认 openai（向后兼容：无 key 仍 throw） | 兼容冒烟（ai.test 全绿） |
| W5 | memory-server.ts：OpenAI 兼容 HTTP 端点（/chat/completions 流+非流 /embeddings /images/generations）——后端 MemoryAi——认证直过（对齐 MemoryPostgresServer） | 新单测（W7） |
| W6 | 消费迁移：agent-platform image-gen/video-gen 改消费 `ctx.ai` 多模态面——编排（任务表/worker/保存 /ws）保留 | 平台 build + e2e 冒烟 |
| W7 | 测试：memory-ai.test.ts（echo/onChat 注入/工具循环单轮/多模态/approve）+ memory-server.test.ts（真 createAiClient 连 MemoryAiServer 全链） | 新测试全绿 |
| W8 | 回归 + 文档：五域全量回归门 + AGENTS/docs 更新 | 全绿（契约+场景+showcase+server+shared+audit） |

## 判负记录

- 不做全新 `AIProvider` 抽象层：已有 `AiClient` 即 provider 面（MemoryAi 直接
  implements——零新增一层）——推翻条件：出现第三 provider 且共享逻辑 >50%
- 不把视频任务状态机/worker/交付物纳入 AIInterface：编排属应用层（`Sql` 也不包
  迁移管理）——推翻条件：第二消费方需要跨应用同一状态机
- 不建协议级 MemoryPostgresServer 同款（视频/图片端点的协议替身以外）：
  只有 HTTP 传输面需要替身（llm 决策）——内嵌 MemoryAi 直调用不到

## 执行实录

（边做边记——波次结果/探针重定位）

## 验收标准

- [ ] AIInterface 正名 + 多模态 3 方法 + 兼容别名（消费端零改动）
- [ ] MemoryAi 全契约（语言/嵌入/多模态/审批——确定性）
- [ ] MemoryAiServer 协议替身（真 client 直连全链）
- [ ] 工厂插槽（provider 选择 + env）
- [ ] image-gen/video-gen 迁消费（编排不动——既有 e2e 绿）
- [ ] 五域回归门全绿 + tsc 0 + 平台 build/e2e
