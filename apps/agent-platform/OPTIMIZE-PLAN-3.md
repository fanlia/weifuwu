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
| T1 | **UI 测试重写（红 → 绿）** | `test/ui/pages.test.ts` 7 基线（Login/Register SSR 零 JS 首屏 + 水合吸收、工作台有数据/空状态、Settings 四卡、AgentDetail 分区/错误态）+ `test/ui/smoke.test.ts` 2（15 静态路由冒烟零错误 + 未登录守卫跳登录）——**形态 = 场景层纪律**：`shared.ts` spawn 真实 server（PORT=0 随机端口——解析框架 `weifuwu listening` 行）+ playwright 真实浏览器 + 错误收集（与 `src/test/scenario/e2e-shared.ts`、`apps/showcase/test/showcase-shared.ts` 同构） |
| T2 | 数据种子纪律 | 注册租户（`/api/auth/register` 一步签发）+ 部门/Agent 走真实 API（不直插 SQL——API 形状漂移即测试失败）+ localStorage 注入认证（`agent_platform_token/user/refresh`——v3-main 启动读取键） |
| B1 | **Register SSR 崩溃**（`location is not defined` → 静默回退 SPA 壳——注册页丢失零 JS 首屏） | `inviteParams()` 工厂期读 `location.search`——node SSR 无 location——惰性守卫（typeof 判定——A1 SSR 纪律与 Login 对齐）——playwright SSR 直取 HTML 断言锁定 |
| B2 | **框架层 api client 错误体丢失**（根因级） | 非 2xx 时 `ApiError` 只报「请求失败 404: GET ...」——服务端 `{error}` 语义（如「Agent 不存在」）客户端不可见——错误面文案/判定全瞎——修复：JSON `{error}` 体解析进 message（无体回落原格式——状态码照透传）——契约测试锁定（`api.test.ts`——框架 208 契约全绿）——**核心层修复惠及所有消费方**（修复归类纪律实证：组件层异常 → 根因在框架 → 修框架） |
| B3 | AgentDetail notFound 误报 | 旧判定纯文本匹配「不存在」——B2 修复前真实 404 永远走「加载失败」分支（错误态不可达——旧 jsdom mock 恰好把 body 塞进 message 掩盖了它）——修复：`status === 404` 优先 + 文本兜底 |
| B4 | **全局限流误伤页面/静态**（429 白屏实证） | 页面 GET + 静态资源计入 100/60s/IP 配额——每次页面访问 3+ 请求耗配额——整页渲染变裸 429 JSON；企业内网多用户同 NAT 出口更甚——修复：限流面收敛 `/api/*`（webhook 豁免不变）+ `RATE_LIMIT_MAX` 可调（默认 100） |
| B5 | server.ts PORT 环境变量 | `serve(app, { port: 3000 })` 硬编码 → `PORT` 可配（`=0` 随机端口 + 框架打印实际端口——测试/多实例部署前提） |

**达成状态**：
- agent-platform tests 181（1 红）→ **189/189 全绿**（+7 页面基线 +2 冒烟——旧失效 1 项歼灭）
- 框架契约层 **208/208**（+1 api 错误体用例）；场景层 **116/116**；双侧 tsc 0；build 731KB 可加载
- 冒烟新能力：19 页路由单会话 2.1s 扫完——后续页面改动零回归防线（ROADMAP 验收「冒烟零回归」正式落地）

**方法论沉淀（旧基建为何死 / 新基建为何对）**：
- 旧形态（jsdom + `createRouter` 直挂）= 框架内部实现细节的私有消费——框架重构
  （ui-dom → client/vdom 统一）即断链——且 jsdom 永远追不上真实浏览器行为
  （吸收/水合/守卫/限流全部测不到——B1/B4 两个 bug 它结构性不可见）
- 新形态（playwright + uiServe 真实 server）= 场景层纪律下沉应用——真实渲染管线 +
  真实认证/数据链路——**测试消费公共契约（HTTP + DOM）不消费内部实现**——
  框架重构不再击穿应用测试

## 剩余缺口（下一波候选——按价值排序）

| # | 项 | 来源 | 估 |
| --- | --- | --- | --- |
| G1 | `/api/deliverables` 契约测试（B1 端点零测试——聚合/排序/深度 1/隐藏文件过滤） | ROADMAP 验收债 | 小 |
| G2 | A2 断线补拉场景测试（ws 断开 → 重连 → loadMessages 合并去重） | ROADMAP 验收债 | 中（需 ws fixture——可参照场景层 `/ws` fixture 形态） |
| G3 | server.ts 单体瘦身：17 条 stats 内联路由 → `src/routes/stats.ts`（1702 行 → 迁移零行为变化——测试全绿即验收） | 工程债 | 中 |
| G4 | C3 审计时间范围筛选（`listAudit` 仅 action 过滤——补 from/to 参数 + Settings 审计卡消费） | ROADMAP C3 | 小 |
| G5 | E1 轮询补偿（WS 长断线 30s 轮询）/ E2 5xx 计数可见性 | ROADMAP E 余项 | 中 |
| G6 | AgentDetail 子分区加载竞态可观测（执行日志等子组件各自 await——慢端点时分区晚到——本次测试靠等待兜住——可加骨架一致性） | 本波观察 | 低 |

## 验收（下一波）
- G1/G2 有测试锁定；G3 纯迁移（测试总数不变全绿——diff 只动 import/位置）
- 每波次收尾：`npm test`（agent-platform）+ 框架 `test:client`/`test:scenario` + 双侧 tsc 0
