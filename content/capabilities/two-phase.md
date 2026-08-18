# 两阶段异步组件 · capabilities

## 概述

mount（工厂，只一次）+ render（每次渲染）——工厂可 await，renderFn 强制异步

## 框架源码

`src/client/ui-dom/vdom3/build.ts`

## 平台自证

- showcase 所有页面

## 相关纪律

`AGENTS.md §3.1`

## 验证

> agent-browser 走查：打开 `/capabilities/two-phase` ——（P1 填充）
