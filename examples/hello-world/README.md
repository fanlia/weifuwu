# hello-world 最小起步项目

```bash
npm i weifuwu
node server.ts    # → http://localhost:3400
```

三文件：server.ts（后端）+ routes.tsx（路由/组件）+ client.ts（前端入口）。
改造：加页面 → routes.tsx 路由表加一行；加数据 → server.ts 加 /api 端点（组件用 ctx.data 读取）。
