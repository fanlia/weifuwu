# EmptyState · components

## 概述

空状态占位，支持 icon/text/hint/action

## 典型场景

- 页面模式：list-page（复制即用蓝本——examples/patterns/）
- 应用模板：todo（examples/apps/ 完整可跑）
- 操作反馈/结果页/确认——保存成功、删除确认、空态/加载态

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `icon` | `string \| VNode \| null` | 否 | 图标——VNode（推荐 <Icon />）或字符串（emoji/字形）；默认 Icon inbox（P3：组件内禁裸 emoji） |
| `text` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<EmptyState
  text="暂无数据"
  hint="提示信息" />
```

## 纪律/坑

> 退场动画（§8）：exit 类必须挂载（animationend 驱动）+ reduced-motion 降级

## 关系

- ↑ 用于页面模式：[list-page](../patterns/list-page.md)
- ↑ 用于应用：[todo](../apps/todo.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/EmptyState/EmptyState.ts` |
| 样式 | `src/client/components/EmptyState/EmptyState.css` |
| 测试 | `src/client/components/EmptyState/EmptyState.test.ts` |
| demo | `apps/showcase/src/demos/DemoEmptyState.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/emptystate` ——（P1 填充具体步骤）
