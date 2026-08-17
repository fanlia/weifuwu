# Pipeline · components

## 概述

Agent 工作流 DAG：分层布局 + 贝塞尔连线 + 状态语义色 + 环检测

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodes` | `PipelineNode[]` | 是 |  |
| `edges` | `PipelineEdge[]` | 是 |  |
| `orientation` | `'vertical' \| 'horizontal'` | 否 | 布局方向（默认 vertical：输入在左→输出在右） |
| `width` | `number` | 否 |  |
| `height` | `number` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Pipeline orientation="horizontal" nodes={[{ id: 'a', label: '输入' }]} edges={[]} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Pipeline/Pipeline.ts` |
| 样式 | `src/components/Pipeline/Pipeline.css` |
| 测试 | `src/components/Pipeline/Pipeline.test.ts` |
| demo | `apps/showcase/src/demos/DemoPipeline.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/pipeline` ——（P1 填充具体步骤）
