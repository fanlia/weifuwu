# ctx.ai（chat/stream/agent/approve） · backend

## 概述

AI 对话全链路：流式 token / 工具调用 / HITL 审批——wf: 协议对页面透明

## 装配

中间件注入键：`ctx.ai`

## 活体端点

```bash
curl /api/chat
```

## 关联组件
- [AiChat](../components/aichat.md)
- [ToolCallCard](../components/toolcallcard.md)
- [ApprovalCard](../components/approvalcard.md)

## 文档素材

来源：`docs/ai-contract.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
