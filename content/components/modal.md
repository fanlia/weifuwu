# Modal · components

## 概述

自定义宽度 + closable 控制关闭按钮

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `open` | `boolean` | 否 |  |
| `title` | `string` | 否 |  |
| `onClose` | `() => void` | 否 |  |
| `children` | `any` | 否 |  |
| `footer` | `any` | 否 |  |
| `width` | `string` | 否 | 自定义宽度，如 '500px'、'80%'，默认 400px |
| `closable` | `boolean` | 否 | 是否显示关闭按钮，默认 true |
| `maskClosable` | `boolean` | 否 | 点击遮罩是否关闭，默认 true（危险确认应设 false） |

## 用法示例

```tsx
<Modal open={open}
  title="标题"
  width="500px"
  closable={false}
  onClose={() => open = false}>
  <p>内容</p>
</Modal>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Modal/Modal.ts` |
| 样式 | `src/components/Modal/Modal.css` |
| 测试 | `src/components/Modal/Modal.test.ts` |
| demo | `apps/showcase/src/demos/DemoModal.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/modal` ——（P1 填充具体步骤）
