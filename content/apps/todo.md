# 任务管理 · apps

## 概述

经典 CRUD 应用：列表/详情/新建——多页路由 + createStore 跨页状态 + 表单受控。后端：MemorySql 持久化。


## 用到的页面模式
- （无）

## 用到的组件
- [Button](../components/button.md)
- [Input](../components/input.md)
- [Checkbox](../components/checkbox.md)
- [Form](../components/form.md)
- [Tag](../components/tag.md)
- [EmptyState](../components/emptystate.md)
- [PageHeader](../components/pageheader.md)

## 源码

> `examples/apps/todo/` ——完整可运行（随 npm 包发布）

## 目录结构

| 文件 | 职责 |
|------|------|
| `app.tsx` | 前端：路由表 + 页面组件（TodoList/TodoNew）+ createStore + hash 桥接 |
| `api.ts` | 后端：registerTodoApi(app, sql)——CRUD 路由（独立/嵌入共享） |
| `server.ts` | 独立入口：MemorySql + ui + 前端服务（:3300） |
| `main.tsx` | 独立前端入口：createTodoApp + hashchange 桥接 |

## 改造指南（新手从跑起来到改成自己的）

- 1. 改数据模型：编辑 api.ts 的 SQL 表结构（todos 表字段）——MemorySql 与 postgres() 同契约，换库只改 server.ts 一行
- 2. 加页面：app.tsx 的路由表加一行 { path, render } + 新建页面组件（组件写法见 guides/component-model.md）
- 3. 改交互/状态：页面组件内 let + ctx.render()（render-only——见 guides/render-only.md）
- 4. 换样式：组件文档「用法示例」+ layout 原语（wf-* 类，零手写 CSS）
- 5. 接真实后端：server.ts 把 createMemorySql() 换成 postgres()（见 content/backend/sql.md）

## 质量标准

- [x] 键盘可达
- [x] 375/768 无溢出
- [x] 亮暗主题
- [x] loading/error/empty 态
- [x] 零控制台错误

## 验证

> agent-browser 走查：打开 showcase `/apps/todo`（活体嵌入）——列表/新建/保存/删除全流程 + 控制台零错误
