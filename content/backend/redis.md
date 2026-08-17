# ctx.redis（自研 RESP 协议层） · backend

## 概述

RedisClient 实现 Redis 契约——缓存/计数/发布订阅；演示用 MemoryRedis

## 装配

中间件注入键：`ctx.redis`

## 活体端点

```bash
curl /api/demo/redis
```

## 关联组件
- [Table](../components/table.md)

## 文档素材

来源：`content/guides/data-guide.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
