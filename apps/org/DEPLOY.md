# Org — 部署文档

## 快速启动

```bash
# 1. 启动依赖服务
docker compose up -d

# 2. 启动 Org 服务
node --env-file=.env apps/org/server.ts

# 3. 打开浏览器
open http://localhost:3001
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `REDIS_URL` | ❌ | Redis 连接字符串 |
| `JWT_SECRET` | ❌ | JWT 签名密钥（默认自动生成） |
| `DEEPSEEK_API_KEY` | ❌ | DeepSeek API 密钥（用于 AI Agent 对话） |
| `DASHSCOPE_API_KEY` | ❌ | DashScope API 密钥（用于知识库向量化） |

## 生产部署

### 1. 构建

```bash
# 构建 weifuwu 核心库
npm run build

# 构建 Org 前端
node apps/org/scripts/build.mjs
```

### 2. 使用静态文件

生产环境建议直接 serve 编译后的文件：

```bash
# 构建后的前端文件在 apps/org/dist/
# server.ts 中的 ui() 中间件会自动处理开发模式的动态编译
# 生产环境可将 dist/ 部署到 CDN 或 nginx
```

### 3. 反向代理（nginx）

```nginx
server {
    listen 80;
    server_name org.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4. 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start node --name org -- --env-file=.env apps/org/server.ts
pm2 save
pm2 startup
```

### 5. Docker 部署

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY . .
RUN npm ci && npm run build

EXPOSE 3001
CMD ["node", "--env-file=.env", "apps/org/server.ts"]
```

## 数据库

使用 PostgreSQL + pgvector 扩展。首次启动时自动创建所有表。

```sql
-- 手动创建 vector 扩展（如未自动创建）
CREATE EXTENSION IF NOT EXISTS vector;
```

## 技术栈

| 组件 | 版本 |
|------|------|
| Node.js | >= 22 |
| PostgreSQL | >= 16 + pgvector |
| Redis | >= 7 |
| weifuwu | 0.33.x |
