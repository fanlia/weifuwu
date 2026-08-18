# ReasoningBlock · components

## 概述

CoT 推理折叠展示：aria-expanded + 键盘可达 + 流式脉冲（thinking 模式 reasoning_content）

## 典型场景

- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 | 推理文本（reasoning_content） |
| `defaultExpanded` | `boolean` | 否 | 初始展开（默认折叠） |
| `label` | `string` | 否 | 折叠头部文案（默认「已思考」） |
| `streaming` | `boolean` | 否 | 流式中（头部脉冲指示） |

## 用法示例

```tsx
<ReasoningBlock content={reasoningText} />
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
| 源码 | `src/client/components/ReasoningBlock/ReasoningBlock.ts` |
| 样式 | `src/client/components/ReasoningBlock/ReasoningBlock.css` |
| 测试 | `src/client/components/ReasoningBlock/ReasoningBlock.test.ts` |
| demo | `apps/showcase/src/demos/DemoReasoningBlock.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/reasoningblock` ——（P1 填充具体步骤）
