# showcase 部署——用 weifuwu 构建的网站（自举）
FROM node:22-alpine
WORKDIR /app
# 安装框架（npm 发布后改为 FROM npm 包；当前从仓库构建）
COPY package.json ./
COPY dist/ dist/
COPY content/ content/
COPY examples/ examples/
COPY docs/ docs/
COPY README.md ./
# showcase 应用（src 模式需仓库源码——发布后切 dist 模式：import 'weifuwu'）
COPY src/ src/
COPY apps/showcase/ apps/showcase/
RUN npm i --omit=dev --no-audit --no-fund 2>/dev/null || true
EXPOSE 3200
CMD ["node", "apps/showcase/server.ts"]
