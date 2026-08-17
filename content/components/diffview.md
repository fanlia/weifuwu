# DiffView · components

## 概述

代码 diff：LCS 行级对比 + 未变块折叠 + 三态着色

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `oldCode` | `string` | 是 | 旧代码 |
| `newCode` | `string` | 是 | 新代码 |
| `oldTitle` | `string` | 否 | 旧标题 |
| `newTitle` | `string` | 否 | 新标题 |
| `foldThreshold` | `number` | 否 | 连续未变行超过该值折叠为「↕ N 行」（默认 5；0 = 不折叠） |
| `maxLines` | `number` | 否 | 最大渲染行数（超出的变化行显示省略提示——防超大 diff 卡顿） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<DiffView oldCode={oldCode} newCode={newCode} oldTitle="重构前" newTitle="重构后" />
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
| 源码 | `src/components/DiffView/DiffView.ts` |
| 样式 | `src/components/DiffView/DiffView.css` |
| 测试 | `src/components/DiffView/DiffView.test.ts` |
| demo | `apps/showcase/src/demos/DemoDiffView.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/diffview` ——（P1 填充具体步骤）
