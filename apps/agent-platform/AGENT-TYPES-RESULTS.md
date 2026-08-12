# Agent 类型完善执行结果

## 👤 user 类型 — ✅ 3/3
- [x] **U1. 孤儿 user agent 修复** — NewAgent 移除「真实用户」类型卡片（AGENT_TYPES 删除 + 注释说明）；API 直调防护 `user 类型必须绑定用户账号`（400）；注册自动创建回归（user_id 绑定 + email 关联）
- [x] **U2. 绑定账号展示** — agents.ts GET /:id LEFT JOIN _weifuwu_users 返回 bound_email/bound_user_name；AgentDetail user 分支显示「绑定账号」卡片（平台用户/登录邮箱/说明）；验证：张明/admin@demo.com
- [x] **U3. 删除保护** — Agents.tsx user 类型隐藏全部操作按钮（单聊/编辑/删除）——只读视图；列表验证 hasEdit/hasDelete/hasDM 全 false

## 🔗 webhook 类型 — 进行中
- [x] **K1. @ KB 机器人聊天回复** — chat.ts 两处（handleNewMessage + runAllAgents）@ 定向扩展：@ 命中 knowledge_base 成员 → 检索 top3（>0.1 阈值）→ 落消息 + WS 推送；@ KB 时不触发 AI；浏览器验证「@产品知识库 退款政策」→ 实时回复检索结果
- [x] **K1 根因修复：随机向量 fallback** — processDocument embedding 失败回退随机 1024 维向量 → 旧 chunk 全垃圾（相似度 -0.006）→ 检索失效。新增 `POST /api/agents/:id/knowledge/reindex`（删旧插新重算 embedding）+ AgentDetail「重新向量化」按钮——reindex 后相似度 -0.006 → 0.66（FAQ 命中）
- [x] **K2. chunk 配置可改** — AgentDetail KB 分支加 分块大小/分块重叠 输入（保存 PUT chunk_size/chunk_overlap）——500→300 保存 DB 更新
- [x] **K3. chunk 详情** — 展开文档 → 块 #N 内容列表（已有 toggleExpandDoc 实现——验证通过）
- [x] **K4. 检索测试入口** — AgentDetail「🔍 检索测试」面板：输入问题 → 相似度排序结果（文件名 + 相似度 + 内容）；验证返回 3 条

## 🤖 ai 类型 — ✅ 4/4
- [x] **A1. AI 绑定知识库** — agents 表加 kb_id 列（幂等 ALTER）+ API 创建/更新 + AgentDetail「绑定知识库」Select（列出租户 KB）+ agent-runner 工具执行注入 _toolAgentId + builtin search_knowledge_base 绑定优先（有绑定只检索绑定 KB，未绑定租户全部）——验证：小维绑定产品知识库 → 客服实习生（绑定 + 技能）@ 问 FAQ → 工具调用 → 回复引用 FAQ 内容
- [x] **A1 根因修复：工具重复声明** — search_knowledge_base 既在 agent.tools 又在绑定技能 → 重复工具名 → DeepSeek API 400 → streamStep 静默空内容（AI 回复为空）。buildToolContext 按工具名去重（真实事故：412 tokens 流式 + 工具调用恢复正常）
- [x] **A2. 对话预览** — `POST /api/agents/:id/preview`（单轮流式，不落消息/不触发 HITL）+ AgentDetail「测试对话」面板（流式展示）——验证：输入「你是什么？」→ 智能客服自我介绍
- [x] **A3. AI 失败重新生成** — 已实现（Chat.tsx error 消息旁「重新生成」按钮 → retryMessage 重发最后用户消息）——验证逻辑完整
- [x] **A4. 向导回归 + 工具落库修复** — 温度 0.2/工具勾选创建落库 ✓；**from-template tools 硬编码 '[]' bug**（模板 default_skills 从不写入）→ 改为映射 BUILTIN_TOOL_DEFS（新模板 Agent 创建后带内置工具）

## 额外发现
- **startDirect 缺 rerender**（NewAgent「跳过模板」视图冻结——FS-03 违规）→ 修复
- **AgentDetail 编辑/删除对 user 类型可见** → 隐藏（U3 的一部分）
- **Input 组件缺 readonly 透传** → 框架 Input.ts 支持 readonly（入站端点只读展示）

> ✅ **状态：全部 15 项完成**（user 3 + webhook 5 + knowledge_base 4 + ai 4，减去 W2 裁剪换 W5 补入）。修复 6 个真实 bug（孤儿 user / 随机向量 / 工具重复 / from-template tools / startDirect rerender / Input readonly）。框架 1936 + app 81 全绿。
