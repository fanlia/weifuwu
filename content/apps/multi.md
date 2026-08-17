# 应用编排 · apps

## 概述

父应用嵌子应用：registerApp/hApp + app:* 边界事件——子应用独立状态。后端：ws 广播。


## 用到的页面模式
- （无）

## 用到的组件
- [Card](../components/card.md)
- [Button](../components/button.md)
- [Input](../components/input.md)
- [Tag](../components/tag.md)
- [Tabs](../components/tabs.md)

## 源码

> `examples/apps/multi/` ——完整可运行（随 npm 包发布）

## 目录结构

| 文件 | 职责 |
|------|------|
| `app.tsx` | 前端：registerApp 注册 2 个子应用 + 父应用工作台（h(App, {appId}) 嵌入） |
| `server.ts` | 独立入口（:3303——纯前端编排无后端 API） |
| `main.tsx` | 独立前端入口 |

## 改造指南（新手从跑起来到改成自己的）

- 1. 加子应用：app.tsx 里 registerApp('my-app', (props, ctx) => h(MyComp, {})) + 父树 h(App, { appId: 'my-app' })
- 2. 子应用传参：h(App, { appId, props: {...} })——app:update 边界事件（见 content/capabilities/app-node.md）
- 3. 观察边界事件：stream.subscribe 过滤 e.entity === 'app'（工作台已展示）

## 质量标准

- [x] 子应用独立状态
- [x] 边界事件观测
- [x] 零控制台错误

## 验证

> agent-browser 走查：打开 showcase `/apps/multi`（活体嵌入）——列表/新建/保存/删除全流程 + 控制台零错误
