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

（待 W0 起填）

## 验收标准

- [ ] W0：错误处理链接线（试点 route 删 try/catch）· 契约 3 · 回归绿
- [ ] W1：响应面收口（手写 error json 计数下降——审计可见）· 契约 2
- [ ] W2：手写面按需迁移（33/29 下降）· 迁移 route 契约绿
- [ ] W3：消噪（String/as any 计数下降 · String(undefined) 风险面 = 0）
- [ ] W4：docs 增补 · 全量回归门（五域 + audit 七线 · tsc 三 0 · 平台 475）
