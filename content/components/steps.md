# Steps · components

## 概述

分步指示器，支持 active/current

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `StepItem[]` | 否 |  |
| `active` | `string` | 否 |  |
| `current` | `number` | 否 |  |

## 用法示例

```tsx
<Steps items={[
  {key:'a',label:'第一步'},
]} active="b" />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Steps/Steps.ts` |
| 样式 | `src/client/components/Steps/Steps.css` |
| 测试 | `src/client/components/Steps/Steps.test.ts` |
| demo | `apps/showcase/src/demos/DemoSteps.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/steps` ——（P1 填充具体步骤）
