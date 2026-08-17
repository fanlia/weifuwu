# Cascader 禁用/错误 · components

## 概述

disabled + error 校验态（状态矩阵覆盖）

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Cascader options={regions} disabled error="地区必填" />
```

## 纪律/坑

> （该分类暂无通用纪律——组件级事故见源码注释）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoCascaderDis.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/cascader-v2` ——（P1 填充具体步骤）
