# DiffView · components

## 概述

代码 diff：LCS 行级对比 + 未变块折叠 + 三态着色

## 典型场景

- 数据展示——列表页、详情页、信息呈现

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

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/DiffView/DiffView.ts` |
| 样式 | `src/client/components/DiffView/DiffView.css` |
| 测试 | `src/client/components/DiffView/DiffView.test.ts` |
| demo | `apps/showcase/src/demos/DemoDiffView.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/diffview` ——（P1 填充具体步骤）
