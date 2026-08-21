# ActionSheet · components

## 概述

动作面板——移动端底部滑出（命令列表 + 取消按钮，openPopup 会话级模态）

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

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

> 弹窗纪律（§5.4）：浮层必须 openPopup 命令式（#__wf_portal 统一容器）——禁 absolute 相对父容器（overflow/transform 裁剪）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/ActionSheet/ActionSheet.ts` |
| 样式 | `src/client/components/ActionSheet/ActionSheet.css` |
| 测试 | `src/client/components/ActionSheet/ActionSheet.test.ts` |

## 验证

> agent-browser 走查：打开 `/components/overlay/actionsheet` ——（P1 填充具体步骤）
