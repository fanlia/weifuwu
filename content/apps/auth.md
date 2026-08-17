# 登录注册 · apps

## 概述

登录/注册 → 受保护页 → 登出：应用级状态（user store）+ 路由守卫 + ctx.data。后端：认证中间件。


## 用到的页面模式
- （无）

## 用到的组件
- [Card](../components/card.md)
- [Form](../components/form.md)
- [Input](../components/input.md)
- [PasswordInput](../components/passwordinput.md)
- [Button](../components/button.md)
- [Alert](../components/alert.md)

## 源码

> `examples/apps/auth/` ——完整可运行（随 npm 包发布）

## 目录结构

| 文件 | 职责 |
|------|------|
| `app.tsx` | 前端：AuthFormPage（登录/注册两用）+ 路由守卫 + authStore |
| `api.ts` | 后端：registerAuthApi——内存用户表 + token 会话 |
| `server.ts` | 独立入口（:3301） |
| `main.tsx` | 独立前端入口 |

## 改造指南（新手从跑起来到改成自己的）

- 1. 换用户存储：api.ts 的 auth_users 表 → 接 userSystem 中间件（见 content/backend/auth.md）
- 2. 加受保护页：app.tsx 路由表加页面 + 组件内读 authStore.state.user 做守卫（同 DashboardPage 模式）
- 3. 改会话持久化：app.tsx 的 ctx.browser.storageSet 已处理——key 名 auth:token 可改
- 4. 加角色权限：守卫处加角色判断（user 表加 role 字段）

## 质量标准

- [x] 键盘可达
- [x] 表单校验
- [x] 错误态
- [x] 会话持久化
- [x] 零控制台错误

## 验证

> agent-browser 走查：打开 showcase `/apps/auth`（活体嵌入）——列表/新建/保存/删除全流程 + 控制台零错误
