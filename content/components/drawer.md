# Drawer · components

## 概述

侧边面板，左右滑入 + ESC 关闭

## 典型场景

- 应用模板：agent-platform（examples/apps/ 完整可跑）
- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `open` | `boolean` | 否 |  |
| `title` | `string` | 否 |  |
| `position` | `DrawerPosition` | 否 |  |
| `onClose` | `() => void` | 否 |  |
| `children` | `any` | 否 |  |
| `footer` | `any` | 否 |  |
| `width` | `string` | 否 | 面板宽度（默认 360px——--wf-drawer-width 变量） |

## 用法示例

```tsx
<Drawer open={open}
  title="编辑" position="right"
  onClose={() => open = false}>
  <p>内容</p>
</Drawer>
```

## 纪律/坑

- 退场动画：--enter/--exit 类必须成对（audit 强制）——只定义不挂是死代码（CS-01）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Drawer/Drawer.ts` |
| 样式 | `src/components/Drawer/Drawer.css` |
| 测试 | `src/components/Drawer/Drawer.test.ts` |
| demo | `apps/showcase/src/demos/DemoDrawer.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/drawer` ——（P1 填充具体步骤）
