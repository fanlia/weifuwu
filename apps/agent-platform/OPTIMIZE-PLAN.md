# 前端交互界面优化计划

## 当前状态（2026-07-25 实测）

三次对话全部成功：

| 次数 | 消息 | 响应 | 长度 | 工具调用 |
|------|------|------|------|----------|
| 1 | git hook 脚本 | ✅ 预提交脚本 | 391 chars | 无 |
| 2 | 列出工作空间文件 | ✅ 文件树 | 441 chars | `list_files` ✅ |
| 3 | 现在几点 | ✅ 当前时间 | 41 chars | `get-current-time` ✅ |

合计新增 token：2447 + 25394（均成功写入 agent_logs）

## Phase 1 — 已完成 ✅

- [x] 超时 15 秒 → 60 秒 (deepseek.ts)
- [x] 捕获 `reasoning_content` 并传递到后续请求 (types.ts + deepseek.ts + agent.ts)
- [x] 事件系统重构：ai:status / ai:token / ai:tool，完整映射状态机
- [x] ai:done 过早发送修复：streamAgent 完成后再发 complete

## Phase 2 — 流式动画与状态视觉（当前任务）

- [ ] **Thinking 动画**：`status: "thinking"` 时气泡显示跳动 dots（···），替代静态文字
- [ ] **生成闪烁光标**：`status: "generating"` 时气泡末尾显示闪烁 `▊`
- [ ] **工具调用卡片**：running 时脉冲动画，done 时淡入绿色对勾
- [ ] **思考指示灯**：`thinking` 状态时气泡左侧显示跳动的点
- [ ] **发送按钮状态**：sending 时显示 spinner

### 前端文件
- `ui/pages/Chat.tsx` — 消息渲染、状态展示
- `src/ui/routes.ts` — CSS 样式表（全部内联在 GLOBAL_CSS）

## Phase 3 — 交互细节 ✅

- [x] **自动聚焦输入框**：页面加载后 / 发送后自动 focus
- [x] **平滑滚动**：CSS `scroll-behavior: smooth` + 用户未手动滚动时才自动滚到底部
- [x] **Token 用量样式**：圆角标签 `⚡ 200 tokens`，hover 显示详情
- [x] **相对时间自动刷新**：每 30 秒自动更新

## Phase 4 — 错误与重试

- [ ] **错误重试**：AI 回复失败时气泡上显示 "🔄 重新生成" 按钮
- [ ] **断连提示**：WS 断开时顶部显示 "连接断开，正在重连..."
- [ ] **发送失败保护**：发送失败时保留输入内容 + 错误提示

## Phase 5 — 代码质量

- [ ] 拆分 Chat.tsx（~400 行 → 组件化）
- [ ] typings 抽取到独立文件
