# API 体验提升（2027-xx）

> 一句话目标：**服务端 handler 动线收口**——错误处理链单源化（消灭每 route
> try/catch 样板）+ 响应面统一（148 处手写 error json 消亡）+ 手写面剩余
> 迁移（bodyOf/listQuery 按需）+ 噪音消减（String()/as any）。
> 动机（消费证据）：agent-platform 92 route 实证——响应面/错误面/解析面
> 三处样板各自为政；框架 `app.onError` 链已成但**无人接线**（平台每 route
> 自己 try/catch + 手写 error json——绕过了链）。

## 现状探针（2027-xx 读数——数字是锚点）

| 面 | 现状 | 目标 |
| --- | --- | --- |
| 手写 `Response.json({ error: ... })` | **148 处**（routes 全域） | → 收口（errorResponse/语义 helpers——0 手写 error json） |
| `errorResponse`/`ok()`/`created()` 使用 | **3 处** | → 普及（响应面单源） |
| 手写 `req.json() as ...` | **33 处**（agents 已收口 1 处——试点存留） | → 按需迁移（新 route 新式 + 高频旧 route） |
| 手写 `searchParams.get/parseInt` | **29 处**（list 收口 1 处） | → 同上 |
| `as any`/`as never`（routes） | **93 处** | → 消噪（类型面已对——惯性残留清理） |
| `String(...)`（routes） | **250 处** | → 消噪（appId 已 string——纯惯性） |
| 每 route 手动 try/catch 返回 error | 40+ 处（私有实现无统一面） | → `app.onError` 链接线（错误面单源） |
| services 可测性 | 32 个 service（无契约层测试面） | → 盘点 + 判负（登记） |

框架面已验证：`Router.onError(handler)` 存在（router.ts:158——ErrorHandler 链）
但未被消费（grep 平台 server.ts 无 onError 接线）——**错误面双路**：链存在 +
route 内 try/catch 绕过链。

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **错误处理链落地**：框架 `errorResponse` 语义对齐 ErrorHandler 契约（HttpError/DbError → 状态码映射——链入口统一）+ **错误码结构化面**（`{ error, code }`——ValidationError→字段路径·DbError→语义码（23505 唯一冲突等）——开发者可 switch 而非解析 message 字符串）+ 平台 server.ts `app.onError` 接线 + agents route 试点**删 route 内 try/catch**（错误面单源——链捕获） | 契约 4（三型映射 + 错误码面）· 前端 errMsg 兼容（message 面不变）· 平台试点 diff（try/catch 行数下降）· 回归绿 |
| W1 | **响应面收口**：`errorResponse` 归入 response.ts 家族（命名统一——errorOf/jsonError 判负）；平台代表性 route（top 5 收口——admin/survey/knowledge 高频面）——148 处计数下降断言 | 契约 2 + 平台 diff（手写 error json 计数下降——审计可见） |
| W2 | **手写面按需迁移**：新 route 默认新式（bodyOf/listQuery——纪律生效）+ 高频旧 route（按使用热力 top 3）迁移——探针 33/29 下降 | 平台 diff（手写 req.json 计数下降）+ 迁移 route 契约绿 |
| W3 | **消噪专项**：routes 域 String()（250）/as any（93）按语义归类清理（String(undefined) 风险面优先——纯惯性面判负登记） | 平台 tsc 0 + 计数下降 + 无行为 diff |
| W4 | **docs + 回归门**：docs/server.md §5 响应/错误面增补（链落地后的 handler 最小形态——含错误码面用法 `switch(e.code)`）+ **后端 API 速查表**（主导出 ~40 个——入口/签名/1 行示例——docs §2 或新章节）+ 全量回归门 | 五域+audit 七线 + tsc 三 0 + 平台 475 · 速查表覆盖主导出（计数断言） |

## 判负记录（可被新论证推翻）

- **services 契约层全测**：不做——32 services 多数是 orm 直调+编排（价值在
  route 行为——playwright UI 面已覆盖）；推翻：出现「service 为纯函数可
  单测而 route 不可」的实例集
- **bodyOf 全量迁移**：判负（W2 探针实证——33 处中适配集 2-3 处——语义操作体
  非 shape 面）；推翻：语义操作体出现「同 shape 多字段校验样板」>3 处
- **listQuery 全量迁移**：判负（W2——剩余 URL 参数多为操作参数非列表面）；
  推翻：新路由列表查询参数 >5 处手写
- **148 处全量迁移**：不做——按热力 top 5 + 新 route 纪律（同 orm 计划
  判据——试点验证后按需）；推翻：响应面审计哨兵反弹
- **String() 全清**：不做（上轮判负保留——类型已对）——仅 W3 按语义清
  String(undefined) 风险面；推翻：String(undefined) 进库实例出现
- **响应信封统一**（`{ data, total }` 包装所有 200）：不做——裸 JSON 保持
  （信封是审美不是需求——架构成本 > 收益）；推翻：出现「客户端无法区分
  业务数据与元数据」的实例
- **后端请求日志面**（dev 模式请求面板）：不做（查询日志判负延续——热路径+
  无场景）；推翻：出现慢查询/请求级疑难杂症实例（届时 scheduler 日志先）

## 执行实录（边做边记）

- W0（1fad602e）：错误面单源——errorResponse 总面（code 面）· 平台双 onError
  接线 · agents list 删 try/catch（链兜底试点）
- W1（d2c69ba4）：响应面收口——六面 104 处手写 error json → throw HttpError
  （链单源——形状等价 · status 权威）· 契约 2（throw/return 等价 + 家族矩阵）
- W2（e5f2a00e）：手写面按需迁移——bodyOf 试点 2 处（departments patch 变体 +
  messages insert omit 系统列）· **判负登记：bodyOf 全量迁移**（33 处中适配集
  极小——多数是语义操作体（密码/房间/技能配置/审批面——非 shape 输入面）；
  bodyOf 是表输入面不是通用 JSON 面——通用解析 = parseBody）· **listQuery
  判负登记**（剩余 29 处 URL 参数多为操作参数（sandboxId/action/room）——
  非列表查询面；listQuery 适配集 = orm 直查 list（agents 已收）——manager
  封装面（sandboxes）与业务参数面不适配）——推翻条件：语义操作体出现「同
  shape 多字段校验样板」>3 处
- W3（本提交）：消噪专项——**-91 处**（250 → 159 routes 域）· 清理面：
  `eq: String(x)` 幂等噪音 79（x 已知 string——tsc 证型）· `String(auth!.userId)`
  10 · insert/值面幂等 58（appId/params.id/auth.userId 已知 string）· 风险面
  修复：双重 String(String())→单层 · String(null) 风险显式化（department_id
  nullable——msg.department_id && has()——不 String(null)）· **判负归档**：
  剩余 159 处为语义用途（Map 键归一 ~40 · `?? ''` 防护面 · uuid 对象归一）——
  String() 全清判负延续（类型已对——剩面是语义）——推翻：String(null/undefined)
  进库实例出现

## 验收标准

- [ ] W0：错误处理链接线（试点 route 删 try/catch）· 契约 3 · 回归绿
- [ ] W1：响应面收口（手写 error json 计数下降——审计可见）· 契约 2
- [ ] W2：手写面按需迁移（33/29 下降）· 迁移 route 契约绿
- [ ] W3：消噪（String/as any 计数下降 · String(undefined) 风险面 = 0）
- [ ] W4：docs 增补 · 全量回归门（五域 + audit 七线 · tsc 三 0 · 平台 475）
