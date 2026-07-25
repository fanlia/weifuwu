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

- 拆分 Chat.tsx（~450 行 → 子组件）
- 键盘快捷键 (Ctrl+Enter, Esc 取消编辑)
- 多轮对话上下文可视化（显示每轮 tool calls）
- 消息搜索/过滤
