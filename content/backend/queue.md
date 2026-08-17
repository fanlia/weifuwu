# 任务队列（ctx.queue） · backend

## 概述

QueueClientModule——池命令 + 阻塞 worker（注入 Redis 模式）

## 装配

中间件注入键：`ctx.queue`

## 活体端点

```bash
curl /api/demo/queue
```

## 文档素材

来源：`content/guides/saas-guide.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
