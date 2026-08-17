# 05 showcase 演进计划（Evolution）

> 目标：showcase = weifuwu 生态搭建器——外网可访问（发现入口）+ 承载生态（需求/场景/社区）。
> 现状：showcase 仅在 localhost 跑（发现为零）；六域 + 活体 + 文档已就绪。

## 目标与验收

```
目标：weifuwu.dev 可访问 + 搜索引擎可索引 + 承载需求/场景/社区内容
验收：
  □ server PORT env 化 + Dockerfile（一键部署）
  □ 首页 SSR（renderToEvents → eventsToHtml——落地页 SEO）
  □ 组件/指南文档页 SSR（146 组件文档可被搜索引擎索引）
  □ 需求目录（02）与 /community（01）接入平台
```

## 任务清单

| 优先级 | 任务 | 产出 | 依赖 |
|--------|------|------|------|
| P0 | PORT env 化 + Dockerfile（FROM node → npm i weifuwu → 起服务） | 可部署 | — |
| P0 | 首页 SSR：`/` 用 renderToEvents 渲染（复用 docs CLI 已验证模式） | SEO 入口 | — |
| P1 | 文档页 SSR：/components/:id 等 SSR 渲染（docs CLI 渲染逻辑抽为共享函数） | 146 文档可索引 | — |
| P1 | 需求目录接入（首页"我要做什么"入口——02 的 P0 产出挂载） | 场景入口 | 02 |
| P2 | /community 域（01 的社区组件收录——展示层实现） | 生态扩展 | 01 |
| P2 | 案例墙（首页"用 weifuwu 做的应用"——agent-platform + 社区案例） | 传播 | 01 |

## 技术要点

```
- SSR 复用：docs CLI 已验证（renderToEvents → eventsToHtml + Markdown 组件）——抽为 src/cli/ 共享库
- 活体 demo 页保持 SPA（交互需要 JS）——SSR 只用于落地/文档页
- 部署形态：Docker 全栈（wire-fake API/活体嵌入需要完整后端——非静态托管）
- 自举证明："用 weifuwu 构建的网站"就是最好的广告
```

## 质量门槛

```
□ 部署后全端点验证（curl 矩阵：首页/组件/指南/活体/API）
□ SSR HTML 含完整内容（搜索引擎可读——非空 root）
□ 与本地开发零差异（同一 server.ts 代码）
```

## 状态（2026-12 核对）

**P0-P1 全部完成 ✅**——PORT env + Dockerfile / 首页 SSR（hero 静态 + shellHeader）/
文档页 SSR（renderDocPage——157 组件文档可索引）/ 需求目录（首页"我要做什么"）。
P2 本轮落地：**/community 域**（社区组件收录页 + 提交指引 + 首页案例墙入口）；
案例墙已有（首页"用 weifuwu 做的应用"）。剩余：weifuwu.dev 真实部署（域名/托管动作）。

## 状态

进行中——**P0 ✅**（PORT env + Dockerfile + 首页 SSR + **文档页 SSR**——146 组件文档/指南全可索引；含框架 bug 修复：Router 根路径与通配并存）；P1（需求目录接入/案例墙）待做
