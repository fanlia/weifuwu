# ── 构建阶段 ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build

# 复制 monorepo 根配置
COPY package.json package-lock.json ./

# 复制 weifuwu 框架源码（monorepo 内部引用）
COPY src/ ./src/
COPY apps/agent-platform/ ./apps/agent-platform/

# 安装依赖
RUN npm ci

# 构建前端 SPA
RUN node apps/agent-platform/scripts/build.mjs

# ── 运行阶段 ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# 只复制运行时所需
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/src ./src
COPY --from=builder /build/apps/agent-platform/dist ./apps/agent-platform/dist
COPY --from=builder /build/apps/agent-platform/server.ts ./apps/agent-platform/
COPY --from=builder /build/apps/agent-platform/src ./apps/agent-platform/src
COPY --from=builder /build/apps/agent-platform/public ./apps/agent-platform/public
COPY --from=builder /build/apps/agent-platform/scripts ./apps/agent-platform/scripts
COPY --from=builder /build/apps/agent-platform/ui ./apps/agent-platform/ui
COPY --from=builder /build/apps/agent-platform/tsconfig.json ./apps/agent-platform/

EXPOSE 3000
CMD ["node", "--env-file=.env", "apps/agent-platform/server.ts"]
