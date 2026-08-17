# Result · components

## 概述

结果页：success/error/warning/info + extra 操作区

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | `ResultStatus` | 否 |  |
| `title` | `any` | 是 |  |
| `desc` | `any` | 否 |  |
| `extra` | `any` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Result status="success" title="注册成功" desc="…"
  extra={<Button variant="primary">进入工作台</Button>} />
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
| 源码 | `src/components/Result/Result.ts` |
| 样式 | `src/components/Result/Result.css` |
| 测试 | `src/components/Result/Result.test.ts` |
| demo | `apps/showcase/src/demos/DemoResult.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/result` ——（P1 填充具体步骤）
