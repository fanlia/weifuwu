# EMAIL-FIX-PLAN — src/server/email/ 优化修复计划

> 邮件模块（index.ts 适配器层 + smtp.ts 自研 SMTP 客户端）的缺陷修复计划。
> **关键缺陷均已实证**（mock SMTP 服务器字节级 + 自签 TLS 服务器——子进程隔离）。
>
> 基线：email.test.ts 15 测试全绿（SMTP mock 服务器完整会话断言 + Resend mock HTTP API
> 断言 + 配置约束）——零外部依赖（node:http / node:net mock——CS-05 方式）。

---

## 0. 缺陷清单总览

| ID | 严重度 | 缺陷 | 实证 |
| --- | --- | --- | --- |
| E1 | **安全（P1）** | **SMTP header 注入**——`buildMessage` 的 `From:`/`To:` 未清洗——收件人/发件人含 CRLF（用户输入场景：邀请表单 email 字段）→ 任意邮件头注入（Bcc 抄袭/伪造头）——subject 已被 encodeWord 保护（非 ASCII 走 base64）——**From/To 是裸洞口** | 复现：`to: 'a@x.com\r\nBcc: victim@evil.com'` → mock 服务器收到注入头 `Bcc: victim@evil.com`（成功注入） |
| E2 | **可靠性（P1）** | **STARTTLS 升级后会话中断不即时失败**——`upgradeTls` 的 `tlsSocket.once('error', rejectUp)` 在 secureConnect 后 **once 消费移除**——TLS 会话期错误无专属监听器（raw 监听器只兜底层 socket error——TLS 层专属错误面漏）；升级后服务器中断 → 调用方挂起至总 timeout（默认 **30s**） | 复现（自签 TLS 服务器——升级完成后 RST）：客户端 **4s 无任何响应**（旧代码：默认 30s 才报 timeout——用户请求路径挂 30s） |
| E3 | **上游挂起（P2）** | **resend 适配器 fetch 无超时**——provider 网络挂起 → 用户请求无限挂（SMTP 有 timeoutMs——resend 没有——不对称） | 代码审读（resendAdapter 无 signal/定时器——确定性）；SMTP 与 resend 两适配器行为不对称 |
| E5 | **校验（P3）** | **to 为空/无效时仍发信**——`to: []` → RCPT 循环零次 → 直接 DATA（发出"无收件人"邮件）；`to: '   '`/非法地址同样过线 | 代码审读（smtp.ts RCPT 循环无空校验——确定性） |

---

## 1. E1 — SMTP header 注入（P1——确证）

### 根因

`smtp.ts` `buildMessage`：

```ts
lines.push(`From: ${msg.from}`)
lines.push(`To: ${msg.to.join(', ')}`)
lines.push(`Subject: ${encodeWord(msg.subject)}`)
```

- subject 走 encodeWord——`\r\n` 不在 `[\x20-\x7e]` → base64 —— **安全**
- **From/To 裸拼接**——`\r\n` 原样进入邮件头

**复现**：`to: 'a@x.com\r\nBcc: victim@evil.com'` → mock 服务器 lines：

```
To: a@x.com
Bcc: victim@evil.com>      ← 注入成功
...DATA 内容
Bcc: victim@evil.com       ← DATA 里也有
```

（攻击者可在收件人字段注入 Bcc/Reply-To/伪造头——钓鱼/抄袭向量）

### 修复方案（防御点 = buildMessage——任何调用路径安全）

```ts
/** 拒绝 CR/LF 的 header 值（E1：header 注入防御——subject 有 encodeWord——From/To 没有） */
function assertHeaderValue(value: string, name: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`smtp: invalid ${name} header value (CR/LF not allowed)`)
  }
}
// buildMessage 开头：
assertHeaderValue(msg.from, 'From')
for (const to of msg.to) assertHeaderValue(to, 'To')
```

- 拒绝（抛错）> 静默清洗（攻击者可利用清洗差异——拒绝是唯一无歧义语义——G9 编码唯一性同族）
- index.ts `smtpAdapter` 同一校验前置（早点失败——进 DATA 前）

### 测试

1. **to 含 CRLF → reject**（mock 服务器断言：无 Bcc 头进入 + sendSmtp 抛错——旧代码注入成功必挂红线）
2. from 含 CRLF → reject（对称）
3. subject 含 CRLF → encodeWord 保护（回归锁定——非 ASCII 既有测试）

---

## 2. E2 — TLS 会话期错误及时失败（P1——确证）

### 根因

```ts
function upgradeTls(): Promise<void> {
  return new Promise((resolveUp, rejectUp) => {
    const tlsSocket = tls.connect({ socket: socket as net.Socket, rejectUnauthorized: ... })
    tlsSocket.once('secureConnect', () => {
      socket = tlsSocket
      tlsSocket.on('data', onData)
      resolveUp()                              // ← once('error') 在此后已被消费移除
    })
    tlsSocket.once('error', rejectUp)          // 只在升级窗口内生效
  })
}
```

- `once('error')` 在 secureConnect 后**已消费**——TLS 会话期（升级后的 EHLO/AUTH/MAIL/DATA）的 TLS 层错误（解密失败/记录层破坏）**无监听器**——只有底层 `raw.on('error')` 兜底（TLS 层专属错误面漏）
- 升级后服务器中断（RST/无响应）→ 调用方挂起至**总 timeout（默认 30s）**

**复现**（自签 TLS + 升级完成后 RST）：4s 无响应（总 5s timeout 才触发）——生产形态：用户请求路径挂 30s。

### 修复方案（两处）

```ts
tlsSocket.once('secureConnect', () => {
  socket = tlsSocket
  tlsSocket.on('data', onData)
  tlsSocket.on('error', (e) => fail(e))   // E2：TLS 会话期错误 → fail（once 已消费——补监听器）
  resolveUp()
})
```

- `fail` 幂等（reject/clearTimeout/destroy 重复调用安全——raw 监听器与 tls 监听器双路径不冲突）
- **会话内命令级超时**：总 timer 30s 在慢会话（升级前已用 20s）时过晚——将总 timer 语义保持（文档明确——连接级超时），但**每 exchange 响应**受总 timer 保护（fail 时 exchange 的 pending 永挂——外层 reject 兜——记录）

### 测试

3. **TLS 升级完成后服务器中断 → sendSmtp 快速 reject（<3s——旧代码挂到总 timeout）**——自签证书 fixture + tls.createServer mock（测试内证书生成——openssl 生成一次入库 tests/fixtures 或 crypto 生成；`rejectUnauthorized: false` 默认放行——客户端零配置）
4. 升级失败（窗口内）→ reject 保持（回归——既有 requireTls 测试）
5. 正常 TLS 会话完整流程（升级成功 + AUTH + 发送）——新增 e2e 覆盖（现有测试全明文）

---

## 3. E3 + E5 — resend 超时 + 入参校验（P2/P3）

### E3 resend fetch 超时

```ts
export interface EmailOptions {
  ...
  /** 适配器 HTTP 超时（resend）——默认 10_000ms（SMTP 用 smtp.timeoutMs） */
  timeoutMs?: number
}

// resendAdapter：
const timeoutMs = timeouts ?? 10_000
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)
try {
  res = await fetch(`${baseUrl}/emails`, { ..., signal: controller.signal })
} catch (err) {
  if (controller.signal.aborted) throw new HttpError(`email: resend timeout after ${timeoutMs}ms`, 502)
  throw new HttpError(`email: resend 网络错误: ...`, 502)
} finally {
  clearTimeout(timer)
}
```

- 与 SMTP `timeoutMs`（30s 默认）语义对齐——统一「上游超时 = 502 网关错误」
- abort 后错误路径走 catch（fetch reject AbortError）

### E5 to 校验（index.ts send 包装 + smtpAdapter 前置）

```ts
// Mailer.send 包装：
const list = Array.isArray(msg.to) ? msg.to : [msg.to]
if (!list.length || list.some((t) => !t.trim())) {
  throw new Error('email: msg.to 必须是非空收件人列表')
}
```

- 空数组/空串 → 明确抛错（不发出"无收件人"邮件——SMTP 零 RCPT 直接 DATA 是浪费 + 语义错误）
- resend body `to: []` 同样拒绝（统一入口——所有适配器受益）

### 测试

6. **to: [] → 抛错**（旧代码：发信成功——mock 断言零 RCPT 场景消失红线）
7. to: '  ' → 抛错
8. **resend fetch 挂起 → <2s 抛 HttpError 502**（mock 服务器不响应——abort 生效；旧代码：无限挂）
9. 正常 send 回归（15 基线不动）

---

## 4. 测试计划总表

| # | 测试 | 文件 | 断言核心 |
| --- | --- | --- | --- |
| T1 | to 含 CRLF → reject + 无注入头 | email.test.ts | E1 红线（旧代码注入成功） |
| T2 | from 含 CRLF → reject | email.test.ts | E1 对称 |
| T3 | subject CRLF → encodeWord 保护回归 | email.test.ts | 既有语义不破 |
| T4 | TLS 升级后中断 → 快速 reject（<3s） | email.test.ts | E2 红线（旧代码挂到总 timeout） |
| T5 | TLS 升级失败（窗口内）→ reject 回归 | email.test.ts | requireTls 语义保持 |
| T6 | 完整 TLS 会话（升级 + AUTH + 发送成功） | email.test.ts | E2 正向覆盖 |
| T7 | to: [] → 抛错 | email.test.ts | E5 |
| T8 | resend 挂起 → 502（<2s） | email.test.ts | E3 红线 |
| T9 | 正常路径回归 | email.test.ts | 15 基线不动 |

回归：`npm run typecheck` + email 测试全绿 + `npm run test:server` 全库。

---

## 5. 决策记录（判负 + 方案对比）

| 项 | 决策 | 理由 |
| --- | --- | --- |
| E1 拒绝 vs 清洗 | **拒绝（抛错）** | 清洗有语义歧义（攻击者可利用清洗差异构造双义头——「拒绝是唯一无歧义」——G9 编码唯一性同族纪律） |
| E4 resend 错误码区分（429 → 503 等） | **判负（保留 502 + message 含 status）** | provider 状态透传给最终用户无意义（服务端错误语义）；queue 编排重试基于 message 判读——应用编排面——不造机制 |
| SMTP 连接池 | **判负（裁剪声明已有）** | 每次发送新建连接——低频通知场景无收益——场景证据不足 |
| 发送重试 | **判负（裁剪声明已有）** | 「发邮件 = ctx.queue.add」文档示例——重试在队列层——不重复造 |
| 附件（MIME multipart） | **判负（裁剪声明已有）** | 工程量 vs 收益——v1 只 text/html |
| E2 连接级总 timer 改每命令 | **判负（保持总时长）** | 每命令计时复杂度（state machine 化）vs 收益——30s 总限是合理语义——文档明确「连接级超时」 |
| 超时默认值 | resend 10s / SMTP 30s | 服务商 HTTP API 通常 <1s（10s 足够）；SMTP 握手 AUTH 多往返（30s）——各自语义 |

---

## 6. 执行顺序与验收

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | E1 header 注入（assertHeaderValue + 双适配器前置）+ T1/T2/T3 | 注入复现脚本 → reject——旧代码必挂 |
| W2 | E2 TLS 会话期监听器 + 中断即时失败 + T4/T5/T6（自签证书 fixture） | 升级后 RST → <3s reject |
| W3 | E3 resend 超时 + E5 校验 + T7/T8 | 挂起 → 2s 内 502 |
| W4 | 回归 + 全库 test:server | 15 基线 + 新测试全绿 |

每波：`npm run typecheck` + email 测试 + 全库回归。

---

## 7. 已知边界（诚实裁剪）

- E2 的「TLS 层专属错误」无法稳定自动化复现（解密失败时序敏感）——修复以**代码审读确定性**为证 + T4（升级后中断）锁行为面
- SMTP 全文 UTF-8 body（无 base64 编码）——部分老服务商（7bit 限制）可能拒绝——服务商职责——记录
- 无退信/送达率——服务商职责（裁剪声明）
- resend 适配器无重试/幂等键——服务商 API 幂等键不在 v1 面

---

## 8. 执行实录

> 2027-09——**全量交付完成**（W1-W3 一次提交）。

**交付结果**：email 测试 15 → **22**（新增 7 条）——全部绿色；`npm run typecheck` 全库通过。

| 波次 | 内容 | 测试 | 备注 |
| --- | --- | --- | --- |
| W1 | E1 header 注入——**双点防御**：sendSmtp 入口（协议命令层前置——零会话字节）+ buildMessage（DATA 组装）；index.ts 统一校验层（From/To CRLF + to 非空——所有适配器受益） | T1（to CRLF 拒绝 + 无注入头）/ T2（from CRLF）/ T3（subject encodeWord 保护回归） | **执行中修正**：初版只防 buildMessage——**RCPT 命令级注入**（命令拼接时 CRLF 已进 wire——mock 收到 `Bcc:` 命令——T1 红）——入口前置后零会话字节 |
| W2 | E2 TLS 会话期监听器（error + **close** → fail——fail 幂等——正常完成 no-op） | T4（升级后中断 <3s reject——旧代码挂至 timeout）/ T5（完整 TLS 会话正向） | **执行中修正**：初版只绑 error——升级后 RST/FIN 走 **close** 事件（error 不触发——T4 挂满 5s 红）——close → fail 双兜底；自签证书 fixture 内嵌测试文件（3650 天有效期） |
| W3 | E3 resend timeoutMs（默认 10s——AbortController——网络错误/超时统一 502）+ E5 to 非空校验 | T7（to:[] 拒绝）/ T8（resend 挂起 → <1.5s 502） | **执行中修正**：统一校验层曾把 `msg.to` 归一为数组传给适配器——**自定义适配器可观测形状变更**（deepEqual 红——T 基线回归）——校验用归一化、传原形 |

**执行教训汇总**（入库）：
- **header 注入的完整攻击面 = 协议命令拼接 + DATA 头组装两处**——DATA 层防御不够（命令注入
  先发生）——防御点必须从「发送任何字节」之前开始（zero-byte 前置）
- TLS 会话中断的客户端事件面是 **close 而非 error**（RST/FIN 形态）——error 监听器不够——
  close → fail（fail 幂等——正常完成 no-op——promise 已 settle）
- 适配器包装层对消息对象的**形状变更**（to 归一）会影响自定义适配器可观测面——校验与
  透传分离（校验用归一化、传原形）

**全库回归**：`npm run test:server`（提交前完整验证）。
