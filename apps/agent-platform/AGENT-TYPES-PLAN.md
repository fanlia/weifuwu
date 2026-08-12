# Agent 类型功能完善计划

> 目标：优化 `apps/agent-platform` 支持的 **4 种 agent 类型**（ai / user / webhook / knowledge_base），
> 每种类型列出功能完善清单，**agent-browser 逐个测试（红→绿）→ 修复 → 标记完成**。
> 执行结果记录于 `AGENT-TYPES-RESULTS.md`。

## 现状盘点（代码审计结论）

| 类型 | 已支持 | 缺口 |
|------|--------|------|
| 🤖 `ai` | 创建向导/模板、聊天 @ 定向 + 流式、工具调用（builtin 2 + skills）、HITL 审批、编辑/删除/详情 | 知识库绑定缺失（search 检索租户**所有** KB）；无对话预览；AI 失败无重新生成 |
| 👤 `user` | 注册自动建、聊天 sender | **普通用户可创建 user 类型 → user_id=null 孤儿**（真 bug）；无绑定账号展示；删除保护缺失 |
| 🔗 `webhook` | 入站 POST + HMAC + nonce 重放防护 + 重试 + 日志 | **webhook_url 是死配置**（创建必填但出站从未使用）；聊天中不可 @；retry_count 无 UI；无测试按钮 |
| 📚 `knowledge_base` | 文档上传/列表/删除/检索 API + 详情 UI | **聊天中不可 @**（chat.ts 只查 ai）；chunk 配置创建后不可改；chunk 详情/检索测试体验待验证 |

## 验收方法

- 交互：agent-browser（真实点击/CDP）
- 后端：curl + DB cross-check（docker `weifuwu-postgres-1`）
- 每项：红（现状失败）→ 修复 → 绿（验证通过）→ [x] 标记

---

## 1. 🤖 ai 类型（AI 机器人）

- [ ] **A1. AI 绑定知识库** — AgentDetail 选择绑定 1 个 knowledge_base agent；`search_knowledge_base` 工具只检索绑定 KB（未绑定 → 租户全部，保留现状）
  - 测试：建 KB → AI 绑定 → 聊天问文档问题 → 回答引用绑定 KB 内容
- [ ] **A2. 对话预览（测试聊天）** — AgentDetail 加「测试对话」面板：输入 → 流式回复（复用 chat 管线，无部门依赖）
  - 测试：预览面板发消息 → 收到流式回复 + 工具卡片
- [ ] **A3. AI 失败重新生成** — 消息 error 状态旁加「重新生成」按钮 → 重新调 LLM
  - 测试：模拟失败消息（编辑 content 为错误态）→ 点重新生成 → 回复恢复
- [ ] **A4. 创建向导回归** — 温度/工具/HITL 配置项在向导第 3 步展示且创建后落库
  - 测试：向导选模板 → 温度改 0.2 → 创建 → AgentDetail 显示 0.2 + tools 勾选

## 2. 👤 user 类型（真实用户）

- [ ] **U1. 修复孤儿 user agent** — NewAgent 向导**移除「真实用户」类型选项**（user agent 只由注册自动创建）或创建时强制绑定当前登录用户
  - 测试：NewAgent 无 user 类型可选中（或创建后 user_id = 当前用户，DB 验证）
- [ ] **U2. 绑定账号展示** — user agent 详情显示绑定平台账号（登录邮箱/姓名）
  - 测试：AgentDetail 打开 user agent → 显示「绑定账号：xxx@x.com」
- [ ] **U3. 删除保护** — 绑定当前登录用户的 user agent 删除时确认框提示「删除后将无法以该身份发消息」
  - 测试：点删除 → 确认框文案提示身份影响

## 3. 🔗 webhook 类型（Webhook 机器人）

- [ ] **W1. 修复死配置 webhook_url** — 出站推送实现：聊天 @ webhook 机器人 → POST 到 webhook_url（HMAC 签名）+ 回复落地为消息；或 UI 裁剪为「仅入站无需 URL」
  - 测试：创建 webhook 机器人（不填 URL）成功；或 @ 触发出站 POST（mock server 接收）
- [ ] **W2. webhook 机器人参与聊天 @** — chat.ts 定向逻辑包含 webhook 类型（收到 @ → 出站调用或提示「该机器人仅支持 API 调用」）
  - 测试：@webhook机器人 → 有响应（回复或明确提示，非静默）
- [ ] **W3. retry_count UI** — AgentDetail 可配置失败重试次数（1-5）
  - 测试：改 retry=5 保存 → DB 更新 → 详情显示 5
- [ ] **W4. 测试发送按钮** — AgentDetail「发送测试请求」→ 调用入站端点 → 显示应答 + 日志新增一条
  - 测试：点测试 → 日志列表新增 + 应答展示

## 4. 📚 knowledge_base 类型（知识库）

- [ ] **K1. @ KB 机器人聊天回复** — 聊天 @ knowledge_base 机器人 → 检索 → 返回命中文档摘要（top3 拼接，不调 LLM）
  - 测试：@知识库 问「产品介绍」→ 返回 FAQ.md 命中内容
- [ ] **K2. chunk 配置可改** — AgentDetail 显示并允许修改 chunk_size / chunk_overlap（重建 chunks）
  - 测试：chunk_size 500→200 保存 → DB 更新 + 重分块
- [ ] **K3. chunk 详情验证** — 展开文档 → chunk 列表（内容/相似度）正常显示
  - 测试：展开文档 → chunks 加载 → 删除单 chunk
- [ ] **K4. 检索测试入口** — AgentDetail 输入问题 → 显示相似度排序结果
  - 测试：输入「退款政策」→ 返回 3 条带相似度结果

---

## 执行顺序

1. **user 类型（U1 真 bug 优先）** → U2 → U3
2. **webhook（W1 死配置）** → W2 → W3 → W4
3. **knowledge_base（K1 聊天接入）** → K2 → K3 → K4
4. **ai（A1 知识库绑定）** → A2 → A3 → A4（回归）

每类型完成后：测试全量回归（框架 + app）+ 记录 AGENT-TYPES-RESULTS.md
