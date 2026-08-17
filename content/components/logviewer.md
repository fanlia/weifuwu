# LogViewer · components

## 概述

日志流：ANSI 着色 + 虚拟滚动 + 自动跟随 + 复制

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lines` | `string[]` | 是 |  |
| `height` | `number` | 否 | 视口高度（px），默认 400 |
| `lineHeight` | `number` | 否 | 行高（px），默认 24 |
| `overscan` | `number` | 否 | 可见区外额外渲染行数 |
| `follow` | `boolean` | 否 | 自动跟随：新行到达时若已在底部则滚到底（默认 true） |
| `maxLines` | `number` | 否 | 只显示尾部 N 行（内存保护，默认不限） |
| `showCopy` | `boolean` | 否 | 显示复制按钮（默认 true） |
| `showLineNumbers` | `boolean` | 否 | 显示行号（默认 true） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<LogViewer lines={logs} height={260} follow
  showCopy showLineNumbers maxLines={500} />
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
| 源码 | `src/components/LogViewer/LogViewer.ts` |
| 样式 | `src/components/LogViewer/LogViewer.css` |
| 测试 | `src/components/LogViewer/LogViewer.test.ts` |
| demo | `apps/showcase/src/demos/DemoLogViewer.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/logviewer` ——（P1 填充具体步骤）
