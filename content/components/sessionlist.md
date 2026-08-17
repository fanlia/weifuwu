# SessionList · components

## 概述

会话管理列表：分组（今天/昨天/更早）+ 搜索 + 选中 + 重命名/删除/新建 + 键盘导航

## 典型场景

- AI 对话/工具调用/审批/提示词——agent 场景全链路

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessions` | `Session[]` | 是 |  |
| `activeId` | `string` | 否 | 当前选中会话 id（高亮 + aria-selected） |
| `onSelect` | `(id: string) => void` | 否 | 点击会话（键盘 Enter 同） |
| `onNew` | `() => void` | 否 | 新建按钮（渲染条件：onNew 提供） |
| `onRename` | `(id: string, title: string) => void` | 否 | 重命名（行内编辑 Enter 确认） |
| `onDelete` | `(id: string) => void` | 否 | 删除（行内悬停按钮） |
| `searchable` | `boolean` | 否 | 顶部搜索框（按标题过滤） |
| `newLabel` | `string` | 否 | 新建按钮文案（默认「新建会话」） |

## 用法示例

```tsx
<SessionList sessions={sessions} activeId={cur} searchable
  onSelect={setCur} onNew={create} onRename={rename} onDelete={remove} />
```

## 纪律/坑

> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/SessionList/SessionList.ts` |
| 样式 | `src/components/SessionList/SessionList.css` |
| 测试 | `src/components/SessionList/SessionList.test.ts` |
| demo | `apps/showcase/src/demos/DemoSessionList.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/ai/sessionlist` ——（P1 填充具体步骤）
