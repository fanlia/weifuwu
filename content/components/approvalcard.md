# ApprovalCard · components

## 概述

HITL 审批卡片：pending 可批/拒 + 修改参数（JsonSchemaForm）· approved/rejected/timeout 终态

## 典型场景

- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `request` | `WfApprovalRequest` | 是 | wf:approval_request 数据 |
| `status` | `ApprovalStatus` | 否 | 卡片状态（默认 pending） |
| `onApprove` | `(modifiedArgs?: Record<string, unknown>) => void` | 否 | 用户点"允许"（modified 决策时带修改后参数——父层据此选 decision） |
| `onReject` | `(note?: string) => void` | 否 | 用户点"拒绝"，note 为可选备注（进 agent 上下文） |
| `renderDetail` | `(request: WfApprovalRequest) => any` | 否 | 自定义详情渲染（默认显示 name + args） |
| `loading` | `boolean` | 否 | 提交中（按钮禁用 + 文案反馈，防连点） |
| `argsSchema` | `JsonSchema` | 否 | 工具参数 schema——提供时渲染「修改参数」入口（JsonSchemaForm，预填 request.args），提交带修改后参数 |

## 用法示例

```tsx
<ApprovalCard request={{ id, toolCallId, name, args }}
  argsSchema={toolSchema}                       // 提供 → 「修改参数」入口（JsonSchemaForm）
  onApprove={(modifiedArgs) =>
    chat.approve(modifiedArgs ? 'modified' : 'approved', undefined, modifiedArgs)}
  onReject={(note) => chat.approve('rejected', note)} />

// 终态：<ApprovalCard request={...} status="approved" />
```

## 纪律/坑

> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：[ai](../backend/ai.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/ApprovalCard/ApprovalCard.ts` |
| 样式 | `src/client/components/ApprovalCard/ApprovalCard.css` |
| 测试 | `src/client/components/ApprovalCard/ApprovalCard.test.ts` |
| demo | `apps/showcase/src/demos/DemoApprovalCard.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/approvalcard` ——（P1 填充具体步骤）
