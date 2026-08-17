# todo 应用模板（复制即用）

```bash
# 1. 安装依赖（weifuwu 包——含 content/ 离线文档 + examples/ 模板源码）
npm i weifuwu

# 2. 复制本目录到你的项目（或直接在 examples/apps/todo 内开发）
# 3. 启动
node server.ts    # → http://localhost:todo/3300 3301 3302 3303
```

## 改造指南

见 `node_modules/weifuwu/content/apps/todo.md`（目录结构 + 逐步改造步骤）。

## 结构

| 文件 | 职责 |
|------|------|
| app.tsx | 前端：路由表 + 页面组件 + 状态 |
| api.ts | 后端：API 注册函数（独立/嵌入共享） |
| server.ts | 独立入口（MemorySql——生产换 postgres() 一行） |
| main.tsx | 独立前端入口 |
