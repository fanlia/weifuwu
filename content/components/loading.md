# Loading · components

## 概述

加载状态，支持自定义文字

## 典型场景

- 操作反馈/结果页/确认——保存成功、删除确认、空态/加载态

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 否 |  |

## 用法示例

```tsx
<Loading />
<Loading text="提交中..." />
```

## 纪律/坑

> 退场动画（§8）：exit 类必须挂载（animationend 驱动）+ reduced-motion 降级

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Loading/Loading.ts` |
| 样式 | `src/components/Loading/Loading.css` |
| 测试 | `src/components/Loading/Loading.test.ts` |
| demo | `apps/showcase/src/demos/DemoLoading.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/loading` ——（P1 填充具体步骤）
