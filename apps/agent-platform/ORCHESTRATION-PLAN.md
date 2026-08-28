# Agent 智能编排升级计划（第二代——Planner-Worker + 动态路由）

> **定位**：第一代编排（MULTI-AGENT-PLAN M1-M4）已交付「工具化调用」
> （call_agent 串行请求-响应——深度防环 2 层）。本计划升级到第二代：
> 复杂任务自动拆解 + 并行派发 + 意图路由 + 任务树可观测——对应产品定位
> 「AI 干活需要可控可审计」的**效率面（一线员工）**与**任务链审计面（管理员/老板）**。
>
> **编制日期**：2026-08（第三波收尾后盘点）——先调研后动工——沿用仓库
> 纪律：TDD 先行 / 诚实裁剪 / 真实浏览器验收 / 核心层修复归类。

## 1. 现状盘点（调研结论——已核实）

| 面 | 现状 | 缺口（本计划要补的） |
| --- | --- | --- |
| 委托模型 | `call_agent` 工具：A 串行调 B——单调用单结果——`MAX_DEPTH=2` 防环 | 复杂任务（多步调研/多文件产出）单次委托效率低——无拆解/并行/汇总 |
| 触发模型 | `@Agent名` 定向 / 无 @ 全员广播（chat.ts 164-182 行） | 无意图路由——用户不 @ 时全员消耗 token——简单问题也全员跑 |
| 任务记录 | `agent_logs` 平铺（单条——无父链） | 父任务→子任务树不可见——审计链断——管理员无法看「一次派发产出了什么」 |
| 执行引擎 | 框架 `ai.agent()` 串行 step-loop（单 step 多 tool_call **暂不并发**） | 底层并行——收益最大成本最高（框架层）——**先应用层并行（scheduler 并发 runAgent）** |
| 审批联动 | HITL 按 Agent 风险策略动态判定（C2——串行父子天然等子结果） | 并行子 Agent 后需要**聚合审批闸门**（任一高危子任务 → 整批阻塞） |
| 失败恢复 | 子 Agent 失败即 `Error: 调用失败` 返回——无重试/降级 | 编排任务失败 → 重试/降级/人工接管 |

## 2. 设计（架构——沿用「Agent 作为工具」成熟形态，不自造骨架）

### 2.1 Planner-Worker 编排（核心）

```
用户 → Agent A（编排角色——new tool: plan_tasks）
          │  plan_tasks(task 拆解)——LLM 输出子任务清单（结构化 JSON）
          ├─→ Worker 1（子任务——复用 runAgent/streamAgent——独立工作区）
          ├─→ Worker 2（并行——scheduler 并发——每 worker 独立 run_state）
          ├─→ Worker 3
          └─→ 汇总：A 整合各 worker 结果 → 最终答复（含子任务来源标注）
```

- **触发**：编排 Agent 检测任务复杂度（多目标/多文件/多步——task-markers 服务已有检测面）
  ——复杂 → `plan_tasks` 拆解；简单 → 直接回答（**不拆——成本纪律**）
- **并行**：应用层 scheduler（`Promise.allSettled` + 配额闸门——并发 ≤ 3——复用
  沙盒 per-sandbox 串行队列——无需框架底层并行改造）
- **防环**：延续 `_agentDepth`（MAX_DEPTH=2）——worker 内 call_agent 链不加深
- **工作区**：worker 继承编排者部门（子任务产出归部门目录——交付物面不变）

### 2.2 意图路由（Wave 2）

- **输入**：`agents.description`（已有）+ `expertise` 字段（AgentDetail 已有——补后端索引）
- **机制**：消息 embedding（`ai.embed`——KB 检索已用——复用面）→ 与各 AI Agent
  能力描述相似度排序 → top1 路由（阈值 0.55——低于阈值回退广播）
- **开关**：`intent_route` 默认开（智能）——关闭回退现有 @/广播（兼容）

### 2.3 任务树（可观测——护城河③ 审计面）

- **schema 演进**（`CREATE IF NOT EXISTS`——绝不 DROP——合规）：
  - `agent_logs` 加列 `parent_run_id UUID NULL`（指向父任务——子任务链）
  - 新增 `agent_runs` 表：run_id / parent_run_id / plan_json / worker_results
    / status（planned→running→partial→done→failed）
- **审计视图**：Admin「编排审计」——任务树列表（父→子展开——耗时/token/成功）
  ——Report「任务链」——单次派发 ROI 粒度（老板视角）

### 2.4 可靠性（Wave 3）

- **重试**：worker 失败 → 重试 1 次（换轻量模型——C5 已备）→ 仍败 → 降级
  （结果标注「部分完成——X 子任务失败」——不静默）
- **聚合审批**：并行 worker 的 HITL 冲突——任一 worker 触发 high 风险工具 →
  整批挂起等待（单个 decision 面板——批准/拒绝影响该 worker 后续）
  ——拒绝 → 该 worker 降级为「人工接管」标注（不阻塞已完成的）
- **人工接管**：部分失败 → 消息区出「继续执行」按钮（复跑失败子任务——
  run_state 续跑复用——C1 断点续跑已备）

## 3. 执行顺序（波次——每波可独立验收）

### Wave 1 — Planner-Worker 核心（一线员工效率——最高价值）

| # | 项 | 测试形态 |
| --- | --- | --- |
| O1 | `plan_tasks` 工具：任务拆解（JSON 结构化——target/context/done_criteria） | 契约（mock AI——拆解结果断言） |
| O2 | 并行 scheduler：并发 ≤3 + 配额闸门（sandbox_quota 复用） | 契约（并发数/失败隔离断言） |
| O3 | worker 执行：复用 runAgent（独立 run_state——工作区继承） | 集成（真库——父子日志断言） |
| O4 | 汇总整合：子结果标注来源（「[数据分析师] …」——省 token 摘要截断） | 契约（mock AI——汇总格式断言） |
| O5 | 触发判定：复杂度检测（多目标/多步——不简单任务不拆） | 契约（task-markers 复用断言） |
| O6 | 浏览器端到端：真实对话 → 编排 → 子任务产出 → 汇总（可观测） | 场景（playwright——消息区/日志断言） |

### Wave 2 — 意图路由（降低全员广播成本）

| # | 项 | 测试形态 |
| --- | --- | --- |
| O7 | `agents.expertise` 后端索引 + 语义路由（embedding 相似度 top1 + 阈值） | 契约（mock embed——排序/回退断言） |
| O8 | 路由开关（默认开——@/广播兼容回退）+ 前端路由指示（「任务派给 X」） | 场景（playwright——路由显示断言） |

### Wave 3 — 可靠性编排（管理员/老板可信面）

| # | 项 | 测试形态 |
| --- | --- | --- |
| O9 | 失败重试/降级：worker 执行异常（调用失败/执行异常——非确定性）→ 重试 1 次——确定性错误（找不到/循环/深度）不重试（重试无意义）；仍失败 → worker_results 记 error——「部分完成」标注不静默 | 契约 2 项（重试型 2 次调用恢复 / 确定性 1 次直返） |
| O10 | 聚合审批闸门——**诚实裁剪登记（不实现）**：框架 humanInTheLoop 是 per-tool 挂起等待（每个工具执行前 waitApproval——无绕过）；并行 worker 各自审批是合理语义（不同子任务不同风险）——聚合 UI 收益低——以「worker 状态可观测（worker_results）+ 失败不静默（O9）+ 任务树（O11）」覆盖可靠性面 | —（裁剪理由见 §6） |
| O11 | 任务树落库：`agent_runs` 表（orchestration/worker kind + parent_run_id + plan_json + worker_results + status 状态机 planned→running→partial→done→failed）+ request_id 贯穿（三端事件流关联键） | 契约 4 项（done/partial 部分失败/failed 全败/request_id） |
| O12 | 编排审计视图：`GET /api/stats/runs`（租户隔离——仅本 app——limit 夹紧）+ Reports「编排任务链」卡（状态徽章/编排者/子任务数/失败数/时间） | 端点契约（隔离返回）+ UI 冒烟（Reports 零错误） |

### Wave 4 — 框架层并行 step（最大收益——验证后动）

| # | 项 | 测试形态 |
| --- | --- | --- |
| O13 | `ai.agent()` 单 step 多 tool_call 并发执行（框架层 agent.ts——emit 增补） | 契约（框架侧——并发 step 断言） |
| O14 | agent-platform 接入框架并行（`buildToolContext` 复用——收益放大） | 场景（真实浏览器——并发工具调用断言） |

## 4. 验收标准

- **Wave 1**：O1-O6 绿 —— 浏览器实测：复杂任务 → 编排 → 多个子任务产出 → 汇总
  （父子 agent_logs 链完整——交付物目录可见子任务文件）
- **Wave 2**：O7-O8 绿 —— 不 @ 时意图路由命中单一 Agent（全体广播不触发——token 省）
- **Wave 3**：O9-O12 绿 —— 编排审计视图展开子任务树（耗时/token/成功列）
- **全部**：agent-platform 全量测试绿（沿用当前 208 基线——新测试增量）
  + 框架回归（test:client/scenario——Wave 4 涉框架层必跑）

## 5. 已知边界（诚实裁剪）

- **可视化 DAG 拖拽编排**：不做（需求未验证——工具化调用先探路——与第一代
  非目标一致）
- **Agent 自由对话/消息路由**：限于「任务派发 + 结果返回」——不做 peer 漫谈
- **跨租户协作**：不做（租户隔离红线——护城河③）
- **无限深度**：MAX_DEPTH=2 延续（防环——复杂度上限换取可控性）
- **框架底层并行**：Wave 4 最后做（收益最大但成本最高——先应用层并行验证
  价值——底层改造按需）

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 并行 worker 撞沙盒配额 | 并发闸门（≤3）+ sandbox_quota 复用（每个 worker per-sandbox 串行队列已有） |
| 编排 Agent 拆解质量差（拆错任务） | done_criteria 进子任务 JSON——汇总时自检（C1 自校验复用）+ 人工接管兜底 |
| token 成本上升（拆解 + 并行 = 多 Agent 调用） | 简单任务不拆（成本纪律）+ 轻量模型跑拆解（C5 复用——未来） |
| 意图路由误路由（相似度误判） | 阈值 0.55 保守 + 回退广播 + 路由显示（用户可见——透明） |
| 任务树 schema 演进破坏既有查询 | `CREATE IF NOT EXISTS` + 默认 NULL（旧行兼容）+ 索引只增 |

### O10 裁剪理由（2026-08 实施时确认）

调查结论——**聚合审批闸门不做（诚实裁剪）**：
- 框架 `ai.agent()` 的 HITL 是 **per-tool 挂起等待**（`waitApproval`——每个
  工具执行前阻塞——**无绕过**：任何 high 风险工具调用必然经审批门）
- 并行 worker 各自审批是合理语义（不同子任务不同风险——聚合合并决策反而
  丢失粒度）——「任一 high 整批挂起」的聚合面收益低
- 替代覆盖（已交付）：O9 失败不静默（worker_results 记 error）+ O11 任务树
  （审计面）+ worker 状态可观测（Reports 编排任务链卡）
- 未来若出现「多 worker 同时请求审批」的真实用户反馈——再按需实现
