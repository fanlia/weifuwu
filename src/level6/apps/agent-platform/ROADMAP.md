# agent-platform 产品路线计划（基于产品定位——2026-08 第二波）

> **定位**：给「需要 AI 干活但必须可控可审计」的组织提供企业级 AI Agent 工作平台。
> **护城河**（vs 直用大模型网页版）：① 沙盒安全边界 ② HITL 审批闸门 ③ 多租户隔离。
> **价值主张（4 角色）**：一线员工（AI 同事干活）· 团队管理者（审批闸门）·
> 平台管理员（治理）· 老板（ROI）。
>
> 上一轮（OPTIMIZE-PLAN-2）完成了工程基线（180 测试/tsc 0/构建/冒烟）。
> **本轮：定位对齐——每个方向都对应一个角色价值或一条护城河。**

## 现状差距盘点（已完成——2026-08）

| 面 | 现状 | 缺口（角色） |
| --- | --- | --- |
| 首屏 | 纯 SPA（dist/app.js 719KB——客户端渲染——首屏空白 + 网络往返） | 一线员工高频路径（dashboard/agents）首屏 1-3s |
| 消息可靠性 | WS 断开有 Badge 显示——**重连后不补拉断线期间消息**（onMessage 只处理新事件） | 一线员工对话丢消息（护城河③的体验面） |
| 交付物 | 会话内 FilesSection + 子部门聚合——**无跨部门交付物视图** | 一线员工「AI 干活的产出去哪找」 |
| 沙盒容量 | host:register/hostCapacity 事件有（调度器容量视图）——**管理端无消费 UI** | 平台管理员治理（护城河①） |
| 报表 | Reports 有使用量/成本/活跃度——Agent 维度占比？ | 老板 ROI（agent 级成本归因） |
| 审计 | audit 数据有——Admin 页无筛选/导出体验 | 平台管理员合规（护城河③） |
| 部署 | Dockerfile 有——无生产 compose/部署文档 | 私有化交付（销售闭环） |
| 健康 | /healthz 有（pg/redis/sandbox）——**无 compose healthcheck 接线** | 运维面 |

## 执行顺序（Phase A-E——角色价值优先）

### A — 首屏体验（一线员工）
- A1 **Dashboard/Agents 接入 SSR**：框架 uiServe 面已支持（showcase 全量落地实证）——
  登录后页面服务端渲染（首屏时间|验证）——认证守卫处理（cookie session？——
  现状 token 在 localStorage——SSR 只能做登录页/静态壳——**评估**：dashboard 数据
  需 token——方案：SSR 渲染登录页 + 未登录壳；登录后 SPA 正常）
- A2 **消息断线补拉**：WS 重连（`isConnected` 翻转 false→true）→ `loadMessages()` 补拉
  最近 50 条合并（去重——消息 id 并集）——断线不丢上下文

### B — 交付物闭环（一线员工 · 老板看产出）
- B1 **交付物中心页 `/deliverables`**：跨部门聚合 AI 写文件（列表：部门/文件名/
  时间/大小——GitHub 心智）——数据源：workspace 目录扫描（recentMessages/
  file_updated 事件的累积视图——**后端聚合端点**）
- B2 Dashboard 卡片：最近 3 个交付物（老板视角产出即视）

### C — 治理面（平台管理员——护城河补全）
- C1 **沙盒容量管理视图**（Admin）：host 列表（容量/占用/预算）+ 驱逐事件审计
  （sandbox_events evict 类型已有——消费）
- C2 **报表 Agent 维度**：Reports 加 per-agent 成本/回复排序（老板 ROI 颗粒度）
- C3 **审计筛选**：Admin 审计列表加时间范围/类型筛选

### D — 可销售性（私有化闭环）
- D1 **docker-compose.prod.yml**：postgres + redis + agent-platform +（sandbox 镜像）
  —healthcheck（/healthz 接线）——一键交付
- D2 README 部署章节：生产安装/升级/备份（恢复要点——backups/ 目录已有）
- D3 演示脚本重验：seed → demo-script.md 走查（销售话术与产品能力对齐报告）

### E — 可靠性基石（低优先——A/B 之后）
- E1 轮询补偿：WS 长断线场景（reconnect 失败）→ 30s 轮询补拉（开关可关）
- E2 服务端错误可见性：5xx 计数/日志聚合（现状零监控——生产增强）

## 验收
- A2/B1 有场景测试（channel 消息补拉 / 交付物聚合端点契约）
- D1 一键 up 全绿（本地 compose 实测）
- SSR/首屏改造后冒烟零回归（沿用 audit-showcase 模式——agent-platform 冒烟脚本）
