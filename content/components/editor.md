# Editor · components

## 概述

富文本编辑器，contentEditable + toolbar，零依赖

## API

> props 提取降级（接口格式特殊）——见源码：`src/components/Editor/Editor.ts`

## 用法示例

```tsx
<Editor value={html} onChange={v => html = v}
  placeholder="输入内容..." />

<Editor toolbar={['bold','italic']}
  minHeight="150px" />

<Editor disabled value="只读" />

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
| 源码 | `src/components/Editor/Editor.ts` |
| 样式 | `src/components/Editor/Editor.css` |
| 测试 | `src/components/Editor/Editor.test.ts` |
| demo | `apps/showcase/src/demos/DemoEditor.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/editor/editor` ——（P1 填充具体步骤）
