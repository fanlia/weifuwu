# 前端交互界面优化计划

## 发现的问题

### 1. 🔴 DeepSeek "thinking mode" 导致流式失败（阻断性问题）

- **现象**：多步骤 Agent（含 tool call）流式回复在第二步出错，错误：
  `"The reasoning_content in the thinking mode must be passed back to the API"`
- **根因**：DeepSeek v4-flash 流式 chunk 返回 `reasoning_content`，但后续请求的 assistant
  message 中没有带上它
- **影响**：所有含 tool call 的对话都会在第二步失败，用户只看到部分回复 + "AI 回复失败"

### 2. 🟡 15 秒超时太短

- chat 和 chatStream 都是 15 秒超时，含 tool call 的多轮 LLM 调用容易超时
- **改为 60 秒**

### 3. 🟡 前端交互体验待优化

当前聊天 UI 功能完整但缺乏一些细腻的交互反馈：

## 优化清单

### Phase 1 — 修复阻断性问题

- [x] 超时 15 秒 → 60 秒 (deepseek.ts)
- [ ] 捕获 `reasoning_content` 并传递到后续请求 (types.ts + deepseek.ts + agent.ts)

### Phase 2 — 流式动画与状态视觉

- [ ] **Thinking 动画**：`ai:status: thinking` 时显示跳动 dots（···），替代静态 "🧠 思考中..."
- [ ] **生成光标**：`ai:status: generating` 时气泡末尾显示闪烁光标 `▊`
- [ ] **工具调用卡片**：工具 running 时显示脉冲动画，done 时淡入绿色对勾
- [ ] **状态切换动画**：CSS transition 让状态切换更平滑

### Phase 3 — 交互细节

- [ ] **自动聚焦输入框**：页面加载后 / 发送后自动 focus
- [ ] **平滑滚动**：`scroll-behavior: smooth` + 只在用户未手动滚动时自动滚
- [ ] **空状态改进**：首次打开聊天时显示更好的引导
- [ ] **Token 用量样式**：显示为圆角标签，hover 可看详情

### Phase 4 — 错误与重试

- [ ] **错误重试按钮**：AI 回复失败时气泡上显示 "重新生成" 按钮
- [ ] **网络断开检测**：WS 断开时提示 "连接断开，正在重连..."
- [ ] **消息发送失败**：发送失败时保留输入框内容 + 显示错误提示

## 优先级

1. Phase 1 — 必须先修，否则核心功能不可用
2. Phase 2 — 核心体验提升
3. Phase 3 — 锦上添花
4. Phase 4 — 健壮性
