# ActionSheet · components

## 概述

动作面板——移动端底部滑出（命令列表 + 取消按钮，usePopup 会话级模态）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `open` | `boolean` | 是 |  |
| `items` | `ActionSheetItem[]` | 是 |  |
| `onSelect` | `(key: string) => void` | 否 | 点击项回调（选择后组件自动关闭） |
| `onClose` | `() => void` | 是 |  |
| `cancelText` | `string` | 否 | 取消按钮文案（默认「取消」） |
| `title` | `string` | 否 | 可选标题（面板顶部） |

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
| 源码 | `src/components/ActionSheet/ActionSheet.ts` |
| 样式 | `src/components/ActionSheet/ActionSheet.css` |
| 测试 | `src/components/ActionSheet/ActionSheet.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/overlay/actionsheet` ——（P1 填充具体步骤）
