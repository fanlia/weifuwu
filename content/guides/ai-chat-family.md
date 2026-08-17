# AI 会话家族 · components

> AI 会话场景组件族（07 命名治理：**不合并**——每个组件独立深度使用，统一归 ai 分类）。
> 组合方式：`useChat()` handle 是粘合剂——会话状态 + 流式事件。

| 组件 | 职责 | 组合 |
|------|------|------|
| AiChat | 标准对话界面（气泡+工具卡+审批卡+自动滚动） | 接收 useChat handle——最常用 |
| ChatInput | 独立聊天输入条（IME/多行/流式停止） | AiChat 内部抽取；业务自拼对话页时用 |
| MessageBubble | 单条消息气泡（role/status/actions） | 自拼对话页 |
| SessionList | 会话管理列表（分组/重命名/删除/搜索） | 侧栏 |
| ReasoningBlock | CoT 推理折叠展示 | AiChat renderMessage 内 |
| ToolCallCard | 工具调用三态卡片 | AiChat 内嵌 |
| CitationCard | RAG 引用来源展示 | AiChat renderMessage 内 |
| ApprovalCard | HITL 人工审批（允许/拒绝/修改参数） | AiChat 内嵌；agent 审批流 |
| PromptTemplate | 提示词模板编辑器（变量插入+预览） | 构建 agent 配置页 |

## 组合示例

```tsx
// 最小对话页 = ChatInput + MessageBubble + SessionList（业务布局自控）
// 标准对话 = AiChat（开箱即用）
// Agent 配置 = PromptTemplate（系统提示词）+ JsonSchemaForm（工具参数）
```
