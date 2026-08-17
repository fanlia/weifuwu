# 快速开始

> LLM 路径：本文件是起点。读完后按需打开 content/ 各域。

## 1. 获取文档（三选一，同一份内容）

- 仓库内：`content/index.md`（本文件的上层导航）
- npm 包：`node_modules/weifuwu/content/index.md`（版本永远匹配装的代码）
- 文档站：`npx weifuwu docs` → http://localhost:4000

## 2. 选型（30 秒决策）

| 要做什么 | 打开 |
|---------|------|
| 用某个组件（Button/Table/Modal…） | `content/components/<id>.md`——API 表 + 纪律 + 示例 |
| 拼页面布局（容器/间距/导航壳） | `content/layout/*.md`——wf-* 原语族 |
| 完整页面（后台壳/仪表盘/登录…） | `content/patterns/*.md`——复制即用 |
| 完整应用（todo/auth/admin/multi） | `content/apps/*.md` + `examples/apps/<id>/`——复制即改 |
| 后端能力（sql/redis/ws/ai/limit…） | `content/backend/*.md`——装配代码 + 活体端点 |
| 框架怎么工作（路由/状态/事件流…） | `content/capabilities/*.md` |
| 交付前质量检查 | `content/guides/quality.md` |

## 3. 取码（新手从最小起步）

- **最小起步**：`examples/hello-world/`（server.ts + routes.tsx + client.ts 三文件——复制目录 → `node server.ts` → http://localhost:3400 即跑）——README「快速开始」的落地版
- 组件片段：组件文档「用法示例」节复制
- 完整页面：`examples/patterns/<file>.tsx`（复制文件即得页面）
- 完整应用：`examples/apps/<id>/` 整个目录（复制 → `node server.ts` 即跑）

## 4. 运行

```bash
node server.ts   # 或 node --env-file=.env server.ts（需要环境变量时）
```

## 5. 验证

1. `npx weifuwu docs` 起文档站对照 API
2. 对照 `content/guides/quality.md` checklist 逐项自查
3. 交互组件用 agent-browser 真实点击验证（详见组件文档「验证」节）

