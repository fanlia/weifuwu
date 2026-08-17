# ctx.sql（自研 PG 协议层） · backend

## 概述

PgConnection 实现 Sql 契约——演示用 MemorySql（零 docker），文档说明换 postgres() 一行代码

## 装配

中间件注入键：`ctx.sql`

## 活体端点

```bash
curl /api/demo/sql
```

## 关联组件
- [Form](../components/form.md)
- [Table](../components/table.md)

## 文档素材

来源：`content/guides/data-guide.md`（迁移至本节——P3）

## 验证

> curl 活体端点断言响应（P2 填充具体断言）
