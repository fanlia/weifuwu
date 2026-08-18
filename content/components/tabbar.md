# TabBar · components

## 概述

底部标签栏——移动端 App 主导航（3-5 tab + icon/badge/受控激活 + safe-area 避让）

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `TabBarItem[]` | 是 |  |
| `activeKey` | `string` | 否 | 受控激活 key（不传 = 非受控自管理） |
| `onChange` | `(key: string) => void` | 否 |  |
| `fixed` | `boolean` | 否 | 底部固定（position:fixed + safe-area 避让）——移动端 App 主导航 |
| `className` | `string` | 否 |  |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/TabBar/TabBar.ts` |
| 样式 | `src/client/components/TabBar/TabBar.css` |
| 测试 | `src/client/components/TabBar/TabBar.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/navigation/tabbar` ——（P1 填充具体步骤）
