# TabBar · components

## 概述

底部标签栏——移动端 App 主导航（3-5 tab + icon/badge/受控激活 + safe-area 避让）

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/TabBar/TabBar.ts` |
| 样式 | `src/components/TabBar/TabBar.css` |
| 测试 | `src/components/TabBar/TabBar.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/navigation/tab-bar` ——（P1 填充具体步骤）
