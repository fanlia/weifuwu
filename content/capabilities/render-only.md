# render-only 状态 · capabilities

## 概述

只有 ctx.render() 一种触发——状态是普通对象（let/createStore），无 $ Proxy 无隐式触发

## 框架源码

`src/client/ui-dom/vdom3/router.ts`

## 平台自证

- 搜索框
- 主题切换
- 应用页内嵌 router

## 相关纪律

`AGENTS.md §4`

## 验证

> agent-browser 走查：打开 `/capabilities/render-only` ——（P1 填充）
