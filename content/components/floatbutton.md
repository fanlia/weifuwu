# FloatButton · components

## 概述

悬浮按钮组：展开状态机 + badge

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `icon` | `any` | 否 |  |
| `badge` | `number \| string` | 否 |  |
| `position` | `FloatButtonPosition` | 否 |  |
| `static` | `boolean` | 否 | 'static'：组内子项（不 fixed——独立 fixed 会与主按钮重叠） |
| `disabled` | `boolean` | 否 |  |
| `onClick` | `() => void` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<FloatButtonGroup>
  <FloatButton icon={editIcon} onClick={edit} />
</FloatButtonGroup>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/FloatButton/FloatButton.ts` |
| 样式 | `src/components/FloatButton/FloatButton.css` |
| 测试 | `src/components/FloatButton/FloatButton.test.ts` |
| demo | `apps/showcase/src/demos/DemoFloatButton.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/floatbutton` ——（P1 填充具体步骤）
