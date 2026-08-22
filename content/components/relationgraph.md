# RelationGraph · components

## 概述

关系图谱——环形/网格布局 + 类型着色 + 选中交互（人物/组织/网络）

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodes` | `RelationGraphNode[]` | 是 |  |
| `edges` | `RelationGraphEdge[]` | 是 |  |
| `selectedId` | `string \| null` | 否 | 选中节点 id（受控） |
| `onSelect` | `(id: string) => void` | 否 | 节点点击（选中态切换——父层管理） |
| `onNodeClick` | `(id: string) => void` | 否 | 节点双击/单独动作（如打开 agent 档案——可选） |
| `layout` | `'ring' \| 'grid'` | 否 | 布局：ring（环形——网状关系）| grid（网格——组织/矩阵）——默认 ring |
| `width` | `string` | 否 |  |
| `height` | `string` | 否 |  |
| `showLegend` | `boolean` | 否 | 关系图例（type → 颜色映射） |
| `nodeColors` | `Record<string, string>` | 否 | 类型颜色覆盖（kind → 色值） |
| `edgeColors` | `Record<string, string>` | 否 | 关系类型颜色覆盖（edge type → 色值） |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/RelationGraph/RelationGraph.ts` |
| 样式 | `src/client/components/RelationGraph/RelationGraph.css` |
| 测试 | `src/client/components/RelationGraph/RelationGraph.test.ts` |
| demo | `apps/showcase/src/demos/DemoRelationGraph.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/relationgraph` ——（P1 填充具体步骤）
