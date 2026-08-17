# Button · components

## 概述

4 variants × 3 sizes + loading + block + disabled

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'danger-ghost'` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `block` | `boolean` | 否 |  |
| `loading` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `type` | `'button' \| 'submit'` | 否 |  |
| `title` | `string` | 否 |  |
| `id` | `string` | 否 | 透传 DOM id（测试定位/锚点） |
| `class` | `string` | 否 | 透传原生 class（覆盖默认 wf-btn 组合） |
| `onClick` | `(e: MouseEvent) => void` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Button variant="primary" onClick={...}>Primary</Button>
<Button variant="secondary" />
<Button variant="ghost" />
<Button variant="danger" />
<Button size="sm" /><Button size="md" /><Button size="lg" />
<Button loading>Loading</Button>
<Button disabled />
<Button block />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [workspace](../patterns/workspace.md) · [focus-task](../patterns/focus-task.md) · [docs](../patterns/docs.md) · [landing](../patterns/landing.md) · [list-page](../patterns/list-page.md) · [detail-page](../patterns/detail-page.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[todo](../apps/todo.md) · [auth](../apps/auth.md) · [multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Button/Button.ts` |
| 样式 | `src/components/Button/Button.css` |
| 测试 | `src/components/Button/Button.test.ts` |
| demo | `apps/showcase/src/demos/DemoButton.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/button` ——（P1 填充具体步骤）
