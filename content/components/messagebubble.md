# MessageBubble · components

## 概述

消息气泡：user/assistant + streaming/error 状态 + actions

## 典型场景

- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `any` | 是 |  |
| `role` | `MessageBubbleRole` | 是 |  |
| `status` | `MessageBubbleStatus` | 否 |  |
| `actions` | `any` | 否 | 气泡尾部操作区（重试/复制按钮等，VNode 或数组） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<MessageBubble role="user" content="北京天气如何？" />
<MessageBubble role="assistant" status="streaming" content="…"
  actions={<Button size="sm">重试</Button>} />
```

## 纪律/坑

> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/MessageBubble/MessageBubble.ts` |
| 样式 | `src/components/MessageBubble/MessageBubble.css` |
| 测试 | `src/components/MessageBubble/MessageBubble.test.ts` |
| demo | `apps/showcase/src/demos/DemoMessageBubble.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/messagebubble` ——（P1 填充具体步骤）
