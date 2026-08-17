# PasswordInput · components

## 概述

密码输入：眼睛按钮切换可见性

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 |  |
| `onInput` | `(e: Event) => void` | 否 |  |
| `onChange` | `(e: Event) => void` | 否 |  |
| `label` | `string` | 否 |  |
| `name` | `string` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `autoComplete` | `string` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<PasswordInput label="密码" value={pwd} onInput={e => setPwd(e.target.value)} />
{/* 眼睛按钮切换可见性 */}
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[auth](../apps/auth.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/PasswordInput/PasswordInput.ts` |
| 样式 | `src/components/PasswordInput/PasswordInput.css` |
| 测试 | `src/components/PasswordInput/PasswordInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoPasswordInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/passwordinput` ——（P1 填充具体步骤）
