# ToolCallCard · components

## 概述

工具调用卡片：running / ok / error 状态机（call/progress/result 三字段驱动）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `call` | `WfToolCall` | 是 | wf:tool_call 数据 |
| `progress` | `WfToolProgress` | 否 | wf:tool_progress 数据（可选，展示进度条） |
| `result` | `WfToolResult` | 否 | wf:tool_result 数据（可选，ok/error 终态） |
| `renderArgs` | `(args: Record<string, unknown>) => any` | 否 | 自定义参数渲染（默认 JSON.stringify） |

## 用法示例

```tsx
<ToolCallCard call={{ id, name, args }} />
<ToolCallCard call={...} progress={{ toolCallId, step, total }} />
<ToolCallCard call={...} result={{ id, ok, output }} />

// 状态机：running → ok / error
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：[ai](../backend/ai.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/ToolCallCard/ToolCallCard.ts` |
| 样式 | `src/components/ToolCallCard/ToolCallCard.css` |
| 测试 | `src/components/ToolCallCard/ToolCallCard.test.ts` |
| demo | `apps/showcase/src/demos/DemoToolCallCard.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/toolcallcard` ——（P1 填充具体步骤）
