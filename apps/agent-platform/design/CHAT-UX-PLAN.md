# CHAT-UX-PLAN · 聊天页体验优化计划（产品重心专项）

> 2027-09 制定（深探针实证——Chat.tsx/MessageItem.tsx 976+247 行全量通读 +
> 真实浏览器交互实测：发送流式/长会话 60 条/@ 定向/移动端 390px + 服务端
> chat.ts 事件链核查——不含臆想）。聊天页是产品核心使用面——本计划只收
> 「实证缺口」——每波单一主题——小步快跑——预登记判负。
> 完成状态：**进行中**（波次 1-5 待交付）

---

## 0. 现状基线（本波开始实测）

| 面 | 读数 |
| --- | --- |
| 应用测试 | 357（343 pass / 14 skip / 0 fail） |
| 框架契约 | 428/428 |
| 类型/构建 | tsc 0 错 · build OK |
| 既有能力 | 流式渲染/占位自愈/工具卡/审批卡/文件卡片/拖拽上传/@ 补全（键盘导航）/
搜索（头部）/导出/重试/断点续跑/断线补拉+轮询兜底/超时可见化/呼吸灯——**骨架完备** |
| 代码形态 | Chat.tsx 976 行（上轮已抽 wf-events 纯函数）· MessageItem 247 行 |

## 1. 探针结论（证据链——每条已核实到代码行/截图/console）

### P0 类：正确性（核心体验受损——优先）

| # | 发现 | 证据 |
| --- | --- | --- |
| C1 | **呼吸灯永久卡「干活中…」**——AI 回复完成（tokens 徽章已渲染 = wf:done 已处理）后，左栏成员状态仍「干活中…」不复位 | 实测截图 + 代码：服务端 `src/services/chat.ts` 的 `wf:done`(L663)/`wf:token`(L520)/`wf:step tool`(L527)/`wf:tool_result`(L534) 及配额/计划拦截 `wf:done`(L464/L479) **均不带 agentId**（唯首帧 `wf:step llm`(L457) 带）→ 客户端 `wf-events.ts` `ev.agentId ?? 'ai'` → 关灯打在 `'ai'` 上——真实 agentId 永不复位。影响所有客户端（含同房间其他观看者） |
| C2 | **按键调试 log 残留**——聊天输入每次按键 console.log | 实测：`agent-browser press` → `[debug-onChatKeyDown] key= a ...`。`Chat.tsx` onChatKeyDown 首行（此前「调试残留清理」波漏网） |
| C3 | **框架 Button 忽略 class prop**（核心层）——`ButtonProps.class?: string` 声明「透传原生 class（覆盖默认组合）」但实现拼 `cls` 时未消费 props.class | 代码：`Button.ts` L37 `const cls = [...内置].join(' ')` 无 props.class；实测「部门详情」按钮 `class="wf-hidden wf-flex@sm"` 在 390px 该隐藏却显示（波次 3 面板按钮桌面不隐藏同根因） |
| C4 | **自己新发消息头像显示「?」** | 实测截图：新发消息头像「?」而非「华」——`sendText` `sender_name: data.message.sender_name ?? '我'`——服务端返回**空串**时 `??` 不兜底（`''` 非 nullish）；历史消息（load 路径 join 出名字）正常 |

### P1 类：布局与一致性

| # | 发现 | 证据 |
| --- | --- | --- |
| L1 | **聊天左栏垂直居中悬浮**——aside 顶 y=145 vs 中栏顶 y=24（差 121px），高度 511 vs 752 | DOM 实测：聊天根行 `wf-row` 默认 `align-items: center`，aside 无高度声明 → 居中悬浮。框架有 `wf-self-stretch` 原语未用 |
| L2 | **空态指路文案漂移**——「三步开始：上传资料到**右侧**交付物」 | 实测空会话文本。2026-08 交付物已并入**左栏**（代码注释「右栏删除」）——文案指路错误 |
| L3 | **loadOlder 旧消息无工具条**——「加载更早」prepend 的消息不走 parseStoredTools | 代码：`loadOlder` spread 原始消息；`loadMessages` 才 map parseStoredTools——首屏 AI 消息有工具步骤条，翻页加载后消失（不一致） |
| L4 | **面板按钮响应式失效**（波次 3 回归）——1280px 桌面仍显示移动面板按钮 | 截图 + C3（Button 忽略 class）+ CSS 顺序（`.wf-flex` L1431 晚于 `.wf-hidden@lg` L1407——反向组合 `wf-flex wf-hidden@lg` 不在框架登记的唯一模式内） |

### P2 类：信息密度与 IM 惯例

| # | 发现 | 证据 |
| --- | --- | --- |
| D1 | **消息操作行常驻**——回复/编辑/撤回/删除/复制/👍👎 每条消息恒显 | 截图（移动端尤甚：每条消息 2 行才到内容——60 条消息的会话一半是按钮） |
| D2 | **无日期分隔线**——长会话无「今天/昨天/M月D日」锚点 | 实测 60+ 条消息连续滚动无日期锚 |
| D3 | **相对时间不刷新 + timeVersion 死状态**——「x 分钟前」只在渲染时计算；`$.timeVersion++` 定时器无消费方 | 代码：`setInterval(() => { $.timeVersion++ ... })`——timeVersion 零 JSX 消费（死状态） |
| D4 | **scrolled-up 期间新消息零感知**——isUserScrolledUp 守卫正确（不拽用户）但无「回到底部」浮钮/新消息计数 | 代码 + IM 惯例 |
| D5 | **输入草稿不随会话暂存**——切换会话丢输入 | 代码（$.input 组件态，卸载即失） |
| D6 | **图片附件只有文件名 pill**——png/jpg 无缩略图/预览 | 代码 + attachments meta 已有 `path`（uploads/{msgId}/{name}——存 `data/uploads/`），缺带鉴权的读取端点 |
| D7 | **retryMessage 丢附件/回复引用**——重试只发 content | 代码 L~588：`{ content: lastUser.content }`——attachments/reply_to 丢弃 |

## 2. 波次计划

### 波次 1：正确性四连（C1-C4）
> 修复归类：C1 双端（服务端事件面为主）· C3 核心层（框架组件）· C2/C4 应用层。

- **C1 呼吸灯复位**：服务端 emit 面收敛——`chat.ts` 所有 `wf:*` 事件统一带 `agentId`（8 处——或 emit 包装单点）；客户端 `Chat.applyWf` 兜底：done/error 事件无 agentId 时从目标消息 `sender_id` 推导（对账防线——服务端漏带也不卡灯）
- **C2** 删调试 log
- **C3**（核心层）`Button.ts` 合并 `props.class`：`class: [cls, props.class].filter(Boolean).join(' ')`——契约锁定（Button.test.ts 增 class 合并用例——「透传覆盖默认」注释语义落实）
- **C4** `sender_name: data.message.sender_name || '我'`（空串兜底）
- **防线**：services 测试断言 wf:done/wf:token 事件带 agentId；wf-events 契约扩展（无 agentId done → 从 sender 推导关灯）；Button 契约 class 用例；UI 测试——发消息后头像非「?」
- 验收：实测发消息——AI 完成后左栏呼吸灯 ≤1s 复位；console 零按键日志

### 波次 2：布局与一致性（L1-L4）
- **L1** 聊天 aside 加 `wf-self-stretch`（框架原语——顶部对齐 + 满高）
- **L2** 空态文案改「上传资料到**左侧**交付物」；移动端变体（面板默认隐藏）提示「点头部 👥 面板上传资料」——EmptyState 支持 hint 按 isMobile 切换
- **L3** loadOlder 消息过 parseStoredTools（与 loadMessages 同一 map——单一实现源）
- **L4** 面板按钮：C3 修复后 `wf-hidden@lg` 生效性重验；若 CSS 顺序仍冲突 → app 层 `ap-only-mobile`（app.css 显隐——框架唯一模式是窄隐宽显，反向属 app 职责）；mobile-shell.test 补桌面断言「≥1024 面板按钮不可见」
- **防线**：UI 测试（1280px 面板按钮隐藏 + 390 可见；loadOlder 后 AI 消息带工具条——种 ai_step 消息）
- 验收：双视口截图走查——左栏满高贴顶、桌面无移动按钮、空态指路正确

### 波次 3：消息密度与 IM 惯例（D1-D3）
- **D1 操作行 hover 化**：桌面（hover-capable）默认隐藏、行 hover/focus-within 显示（CSS `@media (hover: hover)`——纯 CSS 零 JS）；触屏（coarse）保持常驻（无 hover 语义）；键盘可达：focus-within 兜底
- **D2 日期分隔线**：消息流按 `created_at` 日界插入分隔（今天/昨天/M月D日）——渲染期纯推导（不改数据）
- **D3 时间口径**：消息时间改 `HH:mm` 绝对时间（隔天带日期）——消除相对时间不刷新死角；**删除 timeVersion 死状态**（连同其定时器——保留超时扫描职责，timeVersion 字段删）
- **防线**：UI 测试（hover 前操作行不可见/hover 后可见——getComputedStyle；日期分隔存在；时间格式 HH:mm）
- 验收：60 条会话走查——视觉密度提升、日期锚点清晰

### 波次 4：增强包（D4-D7）
- **D4 回到底部浮钮**：scrolled-up 且距底 > 阈值时显示（右下角圆形浮钮）；新消息到达且 scrolled-up → 计数徽章（点击归零回底）；纯渲染推导（onScroll 已有状态位）
- **D5 草稿暂存**：`sessionStorage` keyed by deptId——输入/回复引用暂存，进会话恢复，发送清除
- **D6 图片预览**：新端点 `GET /api/messages/:id/attachments/:name`（鉴权 + 租户校验 + 路径穿越防御——workspace file 端点同款纪律）；气泡内 png/jpg 缩略图（≤200px）；点击 `ctx.ui.openPopup` 大图（anchor 必传纪律）
- **D7 retryMessage** 透传 lastUser 的 attachments/reply_to
- **判负考察点**：D6 若端点复杂度超预期（签名 URL/范围请求）——降级为「点击下载」+ 判负留档
- **防线**：路由测试（附件端点鉴权 401/跨租户 404/穿越拒绝）；UI 测试（浮钮出现/回底/计数；草稿往返）
- 验收：走查增强面 + 全量回归

### 波次 5：验收与归档
- 全量回归（应用 + 框架契约 428）+ tsc 0 + build OK
- 双视口全页走查（零 console 错误/警告）+ **长会话专项**（60+ 条：loadOlder 工具条一致、流式滚动、日期分隔、浮钮）
- 流式专项回归：@ 定向多 AI（问卷填写群）、工具卡 running→done、断线重连补拉（既有测试保绿）
- 计划归档（头部完成标记 + 波次提交锚点）

## 3. 判负预登记（审计后再定——先登记理由）

| 项 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| 未读消息系统（last_read 游标/跨页未读徽章） | schema 变更 + 多端同步 + 全入口（会话列表/工作台/nav）消费面——单波承载不了；当前单用户单设备主流 | 多设备用户实测漏消息 |
| 消息列表虚拟化 | 维持前两轮判负——200 条截断已在（loadOlder 分页兜底）；60 条实测无卡顿 | 长会话实测掉帧 |
| 流式中断按钮 | 后端 markInterrupted 已有但「用户想中途打断」缺场景证据；回复通常 <60s（超时可见化已兜底） | 用户实测长生成卡住想打断 |
| 编辑历史版本 | IM 惯例弱需求——编辑可见性已够 | 合规/审计客户要求 |
| 视频附件播放 | 上传白名单已限文档+图片——视频不在产品面 | 产品决策扩展白名单 |
| 已读回执 | 双人以上部门语义模糊（谁读了算已读）+ 隐私争议 | 客户明确要求 |

## 4. 验收基线（全绿门禁）

应用 `npm test` 357+ 全 pass · 框架契约 428+ 全 pass · tsc 0 · build OK ·
双视口（1280/390）走查零 console 错误/警告 · 长会话（60+）专项通过 · 每波独立 commit
