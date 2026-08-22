# apps/agent-builder — Agent 世界模拟平台

> 蓝图：`design/agent-builder-plan.md`（本质模型/架构/商业模式/落地路线）
> 纯框架消费（零自定义组件/中间件——weifuwu 全能力验证）

## 产品定位

一个"可对话的 agent 世界"平台——把现实问题（调研/推演/模拟/预演）抽象成
有角色、有关系、有事件的世界，让世界自己运行出结果，并允许随时走进世界
与任何角色对话（咨询/干预）。

**本质**：agent = 身份（人设/关系/记忆）× 能力（speak/browse/code...）——
coding agent 只是能力谱系的一种形态。

## 运行

```bash
cd apps/agent-builder
cp ../agent-platform/.env .env   # DATABASE_URL（postgres）+ DEEPSEEK_API_KEY
node server.ts                    # → http://localhost:3400

# 场景世界 seed（幂等——同名跳过）：
node --env-file=.env scripts/seed-world.mjs '红楼梦推演'      # 叙事（8 人物+关系+推演起点）
node --env-file=.env scripts/seed-company.mjs                 # 经营（5 岗位+汇报线+周期事件）
node --env-file=.env scripts/seed-city.mjs                    # 城市（6 代表原型+weight+政策事件）
```

## 架构

```
server.ts                后端：serve + Router + postgres + ai + ui
src/routes/worlds.ts     世界 API（worlds/agents/relations/events/chats/shares CRUD）
src/services/engine.ts   回合引擎（事件类型分发——四调度模式）
scripts/seed-*.mjs       场景世界 seed（走产品 API——幂等）
ui/main.tsx              前端：UIRouter + uiServe + api 中间件
ui/pages/                世界列表/新建/详情（角色/关系/图谱/事件/对话）+ 只读分享
```

## 四调度模式（同一引擎——事件类型分发）

| 模式 | 事件类型 | 回合 | 场景 |
| --- | --- | --- | --- |
| 批处理 | survey | 行动（问卷答案 JSON——按人设逐题） | 问卷/数据收集 |
| 叙事 | plot/directive | 对话（人设 × 关系上下文） | 名著推演/剧本 |
| 经营 | cycle | 行动（岗位职责/决策/汇报） | 公司模拟/决策推演 |
| 城市 | policy | 行动（群体代表评估 + 指标影响闭环） | 政策模拟/城市规划 |

## 能力清单（实测）

- 世界 CRUD + 关系图谱（RelationGraph——weight 节点大小）
- 回合引擎（异步——叙事流轮询——失败隔离——事件状态机）
- 定向对话：咨询（不改世界）/ 干预（成为世界事件——全员回合）——角色记忆注入
- 问卷答案（视角差异化——财务低分 vs 市场高分实证）
- 宏观指标闭环（政策 → 民意 → 指标 ↑/↓ + 共识 + 支持率）
- 只读分享（旁观者视图——/shared/:token——汇报可辩护）
- 三个用户角色：构建者（编辑）/ 指挥官（运行+对话）/ 旁观者（只读）

## 消费面（纯框架验证）

| 面 | 使用 |
| --- | --- |
| 后端 | weifuwu（serve/Router/postgres/ai/ui） |
| 引擎 | weifuwu/vdom（UIRouter/uiServe/h/api） |
| 组件 | weifuwu/components（AppShell/RelationGraph/Card/Form/Select/Textarea...） |
| 布局 | wf-* 原语 |

## 已归档的真实事故（开发纪律）

- mount 层同步 ctx.render() → 栈溢出（渲染中重跑工厂）——load(showSpinner) 模式
- isMigrated 一次性门 → 新表不建——schema 每次启动执行（CREATE IF NOT EXISTS 幂等）
- 协议层 JS 数组参数 → malformed array literal——子查询 / PG 数组字面量
- ChatResponse OpenAI 形状（choices[0].message.content）
- 迁移门/异步回合失败隔离（单角色 error 不影响整体）

## 剩余迭代项（蓝图记录）

宏观方程（L0 替换 LLM 评估）· 真实浏览器填写（agent-browser 集成——浏览器农场）
· code 能力注入（沙盒）· 商业化（租户/订阅——复用 agent-platform 先例）
