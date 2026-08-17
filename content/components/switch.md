# Switch · components

## 概述

开关切换，视觉替代 checkbox

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `checked` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `onChange` | `(checked: boolean) => void` | 否 |  |

## 用法示例

```tsx
<Switch label="启用"
  checked={notify}
  onChange={v => notify = v} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[dashboard](../patterns/dashboard.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Switch/Switch.ts` |
| 样式 | `src/components/Switch/Switch.css` |
| 测试 | `src/components/Switch/Switch.test.ts` |
| demo | `apps/showcase/src/demos/DemoSwitch.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/switch` ——（P1 填充具体步骤）
