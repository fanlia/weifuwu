# Steps · components

## 概述

分步指示器，支持 active/current

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Steps/Steps.ts` |
| 样式 | `src/components/Steps/Steps.css` |
| 测试 | `src/components/Steps/Steps.test.ts` |
| demo | `apps/showcase/src/demos/DemoSteps.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/steps` ——（P1 填充具体步骤）
