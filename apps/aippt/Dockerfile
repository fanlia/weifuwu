# aippt — 私有化部署镜像
# 与本地一致：Node 26 原生跑 TS（server.ts 直接 node 执行，无需编译）
# build context = 仓库根（依赖 weifuwu dist + package-lock.json）

FROM node:26-alpine

WORKDIR /app

# ── 1. 安装 weifuwu 运行时依赖（postgres/ioredis/graphql...）──
# 先只 COPY 清单文件，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── 2. 复制整个仓库（含 weifuwu 已构建 dist/ + aippt 源码）──
COPY . .

# ── 3. 重建 aippt 的 weifuwu 符号链接（镜像内指向 /app）──
RUN mkdir -p /app/apps/aippt/node_modules \
 && ln -sfn /app /app/apps/aippt/node_modules/weifuwu

WORKDIR /app/apps/aippt
EXPOSE 3001

# 环境变量由 docker-compose 注入（.env 不进镜像）
CMD ["node", "server.ts"]
