# 前端交互界面优化计划

## 全部完成 ✅

### Phase 1 — 阻断性问题修复
- [x] 超时 15 秒 → 60 秒 (deepseek.ts)
- [x] 捕获 `reasoning_content` 并传递到后续请求 (types.ts + deepseek.ts + agent.ts)
- [x] 事件系统重构：ai:status / ai:token / ai:tool，完整映射状态机
- [x] ai:done 过早发送修复：streamAgent 完成后再发 complete

### Phase 2 — 流式动画与状态视觉
- [x] **Thinking 动画**：跳动 dots（三个点依次上跳回落）
- [x] **生成闪烁光标**：`span.cursor-blink` 步进闪烁
- [x] **工具调用卡片**：running 时 pulse-ring 动画，done 显示 ✅
- [x] **气泡活跃/错误样式**：primary 边框发光，error 红色背景

### Phase 3 — 交互细节
- [x] **自动聚焦输入框**：onMount + 发送后 refocus
- [x] **平滑滚动**：CSS smooth + 用户滚动检测（< 80px 视为在底部）
- [x] **Token 用量标签**：badge-gray 圆角标签
- [x] **相对时间自动刷新**：timeVersion 每 30s 刷新

### Phase 4 — 错误与重试
- [x] **错误重试**：AI 回复失败时显示 🔄 重新生成按钮
- [x] **断连提示**：WS 断开时顶部黄色横幅
- [x] **发送失败保护**：保留输入内容 + alert 提示

## 实测数据（12 次对话，全部成功）

| 场景 | 状态 |
|------|------|
| 纯文本回复 | ✅ 391 chars |
| 工具调用 + 文本（list_files） | ✅ 441 chars |
| 工具调用 + 文本（get-current-time） | ✅ 41 chars x 6 |
| token 用量写入 agent_logs | ✅ φ |
| 流式超时保护 60s | ✅ |

## 后续建议

- ~~拆分 Chat.tsx~~（已函数化清晰——拆分收益低风险高，裁剪）
- ~~键盘快捷键~~（已实现：ChatInput 组件级 Ctrl/Cmd+Enter 强制发送；聊天编辑态 Esc 取消编辑——Input 组件透传 onKeyDown 修复，2026-12）
- ~~多轮对话上下文可视化~~（已实现：每轮消息工具卡片常驻 + 点击展开参数/结果全文，2026-12）
- ~~消息搜索/过滤~~（已实现：搜索框 + 前滚分页 + @ 补全）

## Wave 5（产品化收尾，2026-12）

- [x] **页面状态类型化**：15 页面 `Record<string, any>` → 类型化状态接口（`ui/lib/types.ts` 共享实体类型）——tsc 编译期暴露 6 处潜在空值/字段错（Agents token_usage、Companies created_at、NewChat member_count、DepartmentDetail Member.id 字段、NewAgent Slider 类型、Chat Ava name）——全部修复
- [x] **激活漏斗埋点**：events 表（部分唯一索引 first_message 去重）+ POST /api/track（鉴权 + 白名单）+ GET /api/stats/funnel（本租户进度 + 全平台转化）+ 前端 track 工具（Bearer token）+ 注册/建 Agent/发消息埋点 + Dashboard 漏斗卡片
  - 实测：新注册用户 register_complete 入库 → Dashboard 显示「注册 ✓ / 建 Agent 未完成」；first_message 重复 track 幂等
  - 踩坑：track 裸 fetch 无 token → protectedRoutes 401 静默失败（已修——localStorage 读 token 带 Bearer）
