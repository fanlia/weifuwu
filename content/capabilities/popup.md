# openPopup 命令式弹窗 · capabilities

## 概述

命令式弹窗（toast 心智）——调用点构建内容 → 内核自管理挂载/更新/卸载/销毁——
定位 + 外部点击/Escape + 会话级模态（presence/trapFocus/lockScroll/mask）——
新弹层一律复用

## 框架源码

`src/client/vdom/hooks/popup-manager.ts`

## 平台自证

- Drawer/代码抽屉/下拉/Modal/Tooltip/Popover/Toast/Notification 等 28 浮层组件

## 相关纪律

`AGENTS.md §5.4`

## 验证

> agent-browser 走查：打开 `/capabilities/popup` ——（P1 填充）
