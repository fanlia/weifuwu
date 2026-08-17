# List · components

## 概述

通用列表：renderItem + divided + header/footer/empty

## API

> props 提取降级（接口格式特殊）——见源码：`src/components/List/List.ts`

## 用法示例

```tsx
<List divided header="最近文件" items={files}
  renderItem={f => <div>{f.name}</div>} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [mobile](../patterns/mobile.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/List/List.ts` |
| 样式 | `src/components/List/List.css` |
| 测试 | `src/components/List/List.test.ts` |
| demo | `apps/showcase/src/demos/DemoList.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/list` ——（P1 填充具体步骤）
