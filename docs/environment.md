# 环境变量与开发命令

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

| 变量 | 用途 | 模块 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres()` |
| `REDIS_URL` | Redis 连接字符串 | `redis()` |

---

# 开发命令

```bash
npm run build       # 构建 dist/
npm run typecheck   # TypeScript 类型检查
npm test            # 运行 node --test
node scripts/release.mjs <version>   # 发布
```

```bash
# 测试前启动依赖服务
docker compose up -d
```

---

