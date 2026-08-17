# ChatInput · components

## 概述

独立聊天输入条（AiChat 抽取）：单行/多行 + streaming 停止 + IME 安全——不自带聊天逻辑

## 典型场景

- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 | 受控值（共享输入态——ChatInput 不持有聊天逻辑） |
| `onChange` | `(v: string) => void` | 是 | 值变化（IME 安全：组合期间不触发） |
| `onSend` | `(text: string) => void` | 是 | 发送（Enter 或按钮）——入参为当前输入文本（trim 后非空才触发） |
| `streaming` | `boolean` | 否 | 流式状态——true 时按钮变「停止」 |
| `onStop` | `() => void` | 否 | 停止回调（streaming 时按钮触发） |
| `error` | `string \| null` | 否 | 错误——非流式时显示「重试」按钮 |
| `onRetry` | `() => void` | 否 | 重试回调 |
| `disabled` | `boolean` | 否 | 禁用（输入 + 按钮） |
| `multiline` | `boolean` | 否 | 多行 textarea（Enter 发送 / Shift+Enter 换行）；默认 false = 单行 input |
| `labels` | `Partial<ChatInputLabels>` | 否 | 标签（i18n 覆盖） |
| `actions` | `VNode \| null` | 否 | 扩展位（附件/知识库/模型选择等） |

## 用法示例

```tsx
<ChatInput value={input} onChange={v => input = v}
  onSend={text => send(text)}      // 回车/按钮触发（trim 后非空）
  streaming={streaming}            // 流式 → 按钮变「停止」
  onStop={() => stop()}
  multiline                         // 多行 textarea（Shift+Enter 换行）
  actions={<button>附件</button>}  // 扩展位插槽
/>

// 纯输入层：不自带聊天逻辑（useChat 组合在消费方）
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
| 源码 | `src/components/ChatInput/ChatInput.ts` |
| 样式 | `src/components/ChatInput/ChatInput.css` |
| 测试 | `src/components/ChatInput/ChatInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoChatInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/chatinput` ——（P1 填充具体步骤）
