# AuthPage · components

## 概述

认证页骨架：居中卡片 + logo + 表单插槽 + 错误条 + 提交 loading（登录/注册复用）

## 典型场景

- 应用模板：agent-platform（examples/apps/ 完整可跑）
- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 标题（如「登录」） |
| `subtitle` | `string` | 否 | 副标题（如「多租户 AI 平台」） |
| `logo` | `VNode \| null` | 否 | logo / 头像位（VNode——Avatar 或图片） |
| `children` | `any` | 否 | 表单字段插槽 |
| `footer` | `VNode \| null` | 否 | 底部链接位（登录↔注册切换） |
| `submitLabel` | `string` | 是 | 提交按钮文案 |
| `loading` | `boolean` | 否 | 提交中——按钮 loading + 禁用 |
| `error` | `string \| null` | 否 | 错误文案（Alert 错误条渲染） |
| `onSubmit` | `() => void` | 否 | 表单提交回调（preventDefault 已处理） |

## 用法示例

```tsx
<AuthPage title="登录" subtitle="多租户 AI 平台" logo={<Avatar />}
  submitLabel="登 录" loading={loading} error={error}
  onSubmit={submit}                 // 表单提交回调（preventDefault 已处理）
  footer={<span>没有账号？<a>注册</a></span>}>
  <Field label="邮箱"><Input type="email" /></Field>
  <Field label="密码"><PasswordInput /></Field>
</AuthPage>

// 纯骨架：字段（children）与提交逻辑（onSubmit）由消费方提供
// 认证流程（token/跳转）不进组件——框架 ctx.auth 可组合
```

## 纪律/坑

> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[agent-platform](../apps/agent-platform.md)
- → 后端能力：[auth](../backend/auth.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/AuthPage/AuthPage.ts` |
| 测试 | `src/components/AuthPage/AuthPage.test.ts` |
| demo | `apps/showcase/src/demos/DemoAuthPage.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/authpage` ——（P1 填充具体步骤）
