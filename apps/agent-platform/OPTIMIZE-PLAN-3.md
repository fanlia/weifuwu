# agent-platform 优化计划（第三波——2026-08 测试纪律对齐）

> 基线（本波开始实测）：tests 181 **1 红**（UI 基线测试断链——框架重构删除
> `src/ui-dom`——旧 jsdom 基建 import 已删模块）；tsc 0；build OK（731KB）。
> 上一波（ROADMAP A-E）已交付：A1 SSR / A2 断线补拉 / B1-B2 交付物 /
> C1 容量视图 / D 部署交付链 / E 可靠性收尾。
>
> **本波主题：测试纪律全面对齐 weifuwu/vdom——UI 测试从失效的 jsdom 直挂
> 改为场景层形态（playwright + 真实 server/uiServe）——改造途中连抓 5 个
> 真实 bug（含 1 个框架层）——全部修复并测试锁定。**

## ✅ 已交付（本波——实测结果）

| # | 项 | 详情 |
| --- | --- | --- |
| G1 | **`/api/deliverables` 契约测试 9 项**——路由捕获 + 真实文件系统 + 假 sql 值捕获：聚合排序/隐藏过滤/深度 1/50MB 拒绝/limit 夹紧/失败部门跳过/自定义路径/空态 401/app_id 隔离意图 | **抓虫：50MB 占位拒绝仅子目录分支有——根层大文件漏网**（注释语义与实现不一致）——统一阈值双分支同判 |
| G4 | **审计时间范围筛选**（ROADMAP C3）——`listAudit` 增 from/to（sql 片段组合）+ 路由 400 校验 + Settings 审计卡时间 Select（全部/近 7/30/90 天——与 action 正交）| 真库测试 8 项（回溯 created_at 时间分布——from/to/窗口/组合/隔离） |
| G3 | **server.ts 单体瘦身**——8 条 stats 路由 → `src/routes/stats.ts`（registerStatsRoutes）——纯迁移零行为变化 | server.ts 1702→1387 行（-315）；隔离审计通过（SQL 已 app_id 隔离——无需豁免登记） |
| G2 | **A2 断线补拉场景测试**——真实浏览器 CDP 网络仿真（setOffline 静默挂起）→ 断线期间 API 发消息（广播丢失）→ 恢复 → 重连补拉（id 去重恰好一次） | **框架层根因修复：ws 心跳看门狗**（浏览器对网络断不触发 close/error——socket 静默挂起——重连永不启动——断线消息永远丢失）——契约测试 2 项锁定 |
| G7 | **register/join 限流硬编码 5/分钟 → REGISTER_LIMIT_MAX 可调**（全量套件工作台测试抖动根因——UI 测试多文件串行注册租户共享 Redis 同 IP 计数破 5） | 生产默认 5 不变（01-auth 限流测试锁定）；UI 测试 server spawn 拉高 |

### 上一批（测试纪律对齐波次——OPTIMIZE-PLAN-3 初版交付）

| # | 项 | 详情 |
| --- | --- | --- |
| T1 | **UI 测试重写（红 → 绿）** | `test/ui/pages.test.ts` 7 基线 + `test/ui/smoke.test.ts` 2（15 静态路由冒烟零错误 + 未登录守卫）——形态 = 场景层纪律（playwright + 真实 server——`shared.ts` spawn PORT=0 + 真实 API 种子 + localStorage 认证注入） |
| B1 | Register SSR 崩溃（`location is not defined` → SPA 壳回退） | 惰性守卫（A1 纪律） |
| B2 | **框架层 api client 错误体丢失** | 非 2xx `ApiError` 携带服务端 `{error}`（契约测试锁定）——核心层修复惠及全库 |
| B3 | AgentDetail notFound 误报 | `status === 404` 优先 + 文本兜底 |
| B4 | 全局限流误伤页面/静态（429 白屏） | 限流面收敛 `/api/*` + `RATE_LIMIT_MAX` 可调 |
| B5 | server.ts PORT 环境变量 | `=0` 随机端口（测试/多实例前提） |

### 框架层本波核心修复（G2 过程发现）

**ws 心跳看门狗**（`src/client/vdom/middlewares/ws.ts`——核心修复惠及全库）：
- 网络硬断时浏览器**不触发 close/error**——socket 静默挂起——onclose 永不执行
  → 重连调度永不启动 → 应用层断线感知/补拉永不触发（A2 失效唯一种子）
- 修复：ping 周期活性检测（任何入站刷新活性——超时强制 close → onclose → 重连链）
  + onerror → close 链（error 不处理后 socket 残留）
- 契约测试 2 项（静默挂起超时断线感知 + onerror close 链）——核心层纪律：修复即契约锁定

## 剩余缺口（下一波候选——按价值排序）

| # | 项 | 来源 | 估 |
| --- | --- | --- | --- |
| G5 | E1 轮询补偿（WS 长断线 30s 轮询）/ E2 5xx 计数可见性 | ROADMAP E 余项 | 中 |
| G6 | AgentDetail 子分区加载竞态可观测（执行日志等子组件各自 await——慢端点时分区晚到——本次测试靠等待兜住——可加骨架一致性） | 本波观察 | 低 |

> G1（deliverables 契约）/ G2（断线补拉场景 + 框架看门狗）/ G3（stats 迁移）/ G4（审计筛选）已交付；
> G7（REGISTER_LIMIT_MAX）为测试隔离附加项——见上表。
