# Modal · components

## 概述

自定义宽度 + closable 控制关闭按钮

## 典型场景

- 应用模板：agent-platform（examples/apps/ 完整可跑）
- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

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

- 退场动画：exit 类必须挂载（animationend 驱动卸载）——reduced-motion 下动画降为 0.01ms 等效瞬时
- 会话级模态四件套：presence/trapFocus/lockScroll 由 openPopup 内核统一提供

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Modal/Modal.ts` |
| 样式 | `src/client/components/Modal/Modal.css` |
| 测试 | `src/client/components/Modal/Modal.test.ts` |
| demo | `apps/showcase/src/demos/DemoModal.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/modal` ——（P1 填充具体步骤）
