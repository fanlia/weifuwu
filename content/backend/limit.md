# rateLimit（ctx.limit） · backend

## 概述

限流中间件——超额返回 429（演示端点轻阈值）

## 装配

中间件注入键：`ctx.limit`

## 活体端点

```bash
curl /api/demo/limit
```

## 文档素材

来源：`content/guides/saas-guide.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
