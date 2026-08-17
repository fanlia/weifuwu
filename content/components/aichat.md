# AiChat · components

## 概述

useChat + 标准对话界面：流式 token / 工具卡 / 审批卡 / 自动滚动，协议对页面透明

## 典型场景

- 应用模板：agent-platform（examples/apps/ 完整可跑）
- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat` | `UseChatHandle` | 是 | ctx.ui.useChat() 返回的会话 handle（同一 $，状态变化自动重渲染） |
| `maxHeight` | `string` | 否 | 消息列表最大高度（默认 '70vh'） |
| `labels` | `Partial<AiChatLabels>` | 否 | 界面文案覆盖 |
| `renderMessage` | `(msg: UiMessage) => any` | 否 | 自定义气泡渲染逃生舱（默认纯文本） |
| `renderToolArgs` | `(args: Record<string, unknown>) => any` | 否 | 工具参数渲染（透传 ToolCallCard） |
| `approveSchema` | `(request: WfApprovalRequest) => JsonSchema \| undefined` | 否 | 审批修改参数：按审批请求返回工具参数 schema（返回 undefined 则审批卡无修改入口； |
| `raiseOnKeyboard` | `boolean` | 否 | 键盘弹起时输入区 fixed 抬升（全屏 chat 布局用；内联卡片默认 false——原生聚焦滚动已够） |

## 用法示例

```tsx
const chat = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
return () => <AiChat chat={chat} />

// 状态：chat.messages / chat.input / chat.streaming / chat.error
// 操作：chat.send() / chat.stop() / chat.retry() / chat.approve(decision)
// 订阅共享：ctx.ui.useExternal(chat) —— 子组件共享会话状态
// agent 消息内嵌：msg.toolCalls / msg.approval
```

## 纪律/坑

> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[agent-platform](../apps/agent-platform.md)
- → 后端能力：[ws](../backend/ws.md) · [sse](../backend/sse.md) · [ai](../backend/ai.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/AiChat/AiChat.ts` |
| 样式 | `src/components/AiChat/AiChat.css` |
| 测试 | `src/components/AiChat/AiChat.test.ts` |
| demo | `apps/showcase/src/demos/DemoAiChat.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/aichat` ——（P1 填充具体步骤）
