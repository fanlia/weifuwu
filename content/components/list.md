# List · components

## 概述

通用列表：renderItem + divided + header/footer/empty

## 典型场景

- 页面模式：workspace、mobile（复制即用蓝本——examples/patterns/）
- 数据展示——列表页、详情页、信息呈现

## API

> props 提取降级（接口格式特殊）——见源码：`src/client/components/List/List.ts`

## 用法示例

```tsx
<List divided header="最近文件" items={files}
  renderItem={f => <div>{f.name}</div>} />
```

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [mobile](../patterns/mobile.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/List/List.ts` |
| 样式 | `src/client/components/List/List.css` |
| 测试 | `src/client/components/List/List.test.ts` |
| demo | `apps/showcase/src/demos/DemoList.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/list` ——（P1 填充具体步骤）
