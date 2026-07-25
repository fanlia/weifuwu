---
name: search-knowledge-base
description: 从 Agent 绑定的知识库中检索相关信息。当用户问题涉及文档、产品手册、FAQ 等内容时使用。
license: MIT
---

# Search Knowledge Base

Searches the agent's knowledge base using vector similarity search. Returns relevant document chunks with similarity scores.

This skill requires:
- A `knowledge_base` type Agent with uploaded documents
- DashScope Embedding API configured (`DASHSCOPE_API_KEY`)

The handler is in `tools.ts`.
