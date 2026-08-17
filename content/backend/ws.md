# WebSocket · backend

## 概述

app.ws(path, handler)——双向实时（聊天/推送/协作）

## 装配

中间件注入键：`ctx.ws`

## 活体端点

```bash
curl /ws/echo
```

## 关联组件
- [AiChat](../components/aichat.md)

## 文档素材

来源：`content/guides/realtime-guide.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
