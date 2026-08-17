# TagsInput · components

## 概述

标签输入：回车/逗号添加 + 中文输入法感知

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string[]` | 否 |  |
| `onChange` | `(tags: string[]) => void` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `maxTags` | `number` | 否 |  |
| `allowDuplicates` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `label` | `string` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<TagsInput value={tags} placeholder="回车添加标签"
  maxTags={10} onChange={setTags} />
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
| 源码 | `src/components/TagsInput/TagsInput.ts` |
| 样式 | `src/components/TagsInput/TagsInput.css` |
| 测试 | `src/components/TagsInput/TagsInput.test.ts` |
| demo | `apps/showcase/src/demos/DemoTagsInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/tagsinput` ——（P1 填充具体步骤）
