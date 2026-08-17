# TagsInput 限制/错误 · components

## 概述

maxTags 限制 + error 校验态（状态矩阵覆盖）

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<TagsInput value={tags} maxTags={3} error="标签超限" onChange={t => set(t)} />
```

## 纪律/坑

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoTagsInputErr.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/tagsinput-v2` ——（P1 填充具体步骤）
