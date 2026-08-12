- [x] **W1. webhook_url 死配置修复** — NewAgent/AgentDetail 标注「预留出站回调地址——当前版本仅支持入站 API，可留空」；Webhook URL hint 语义纠正（原「消息将以 POST 推送到该地址」误导）
- [x] **W5. 入站端点展示** — AgentDetail 显示 `POST /api/webhook/{id}` 只读端点 + 复制按钮（ctx.browser.copyText）；hint 说明签名头
- [x] **W3. retry_count UI 验证** — AgentDetail 已有「重试次数」字段（1-5，DB 持久化）——验证通过
- [x] **W4. 测试发送按钮** — AgentDetail「发送测试请求」→ HMAC 签名（Web Crypto，读表单 secret）→ 入站端点 → 应答展示 + 日志新增 HTTP 200
- [x] **W2. 聊天 @ webhook 诚实裁剪** — webhook 机器人是纯入站 API 机器人（产品定位），@ 补全不包含是正确设计；以入站端点展示 + URL 预留标注作为说明（非静默）

## 📚 knowledge_base 类型 — 进行中
