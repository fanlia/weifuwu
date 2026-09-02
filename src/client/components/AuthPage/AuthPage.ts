/**
 * weifuwu/components — AuthPage
 *
 * 认证页骨架（登录/注册复用——agent-platform Login/Register 抽取）。
 * 布局：居中卡片 + logo + 标题/副标题 + 表单插槽 + 错误条 + 提交 loading + 底部链接。
 *
 * 纯骨架：表单字段（children）与提交逻辑（onSubmit）由消费方提供——
 * 认证流程（token 存储/跳转）不进组件（业务自配，框架 ctx.auth 可组合）。
 *
 * 使用两阶段模型 + render-only。无状态（props 驱动）。
 */

import type { Component, VNode } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { HookEnv } from '../../vdom/hooks/env.ts'
import { Alert } from '../Alert/Alert.ts'
import { Button } from '../Button/Button.ts'
import { Card } from '../Card/Card.ts'

export interface AuthPageProps {
  /** 标题（如「登录」） */
  title: string
  /** 副标题（如「多租户 AI 平台」） */
  subtitle?: string
  /** logo / 头像位（VNode——Avatar 或图片） */
  logo?: VNode | null
  /** 表单字段插槽 */
  children?: any
  /** 底部链接位（登录↔注册切换） */
  footer?: VNode | null
  /** 提交按钮文案 */
  submitLabel: string
  /** 提交中——按钮 loading + 禁用 */
  loading?: boolean
  /** 错误文案（Alert 错误条渲染） */
  error?: string | null
  /** 表单提交回调（preventDefault 已处理） */
  onSubmit?: () => void
}

export const AuthPage: Component<AuthPageProps, { ui: HookEnv }> = (_init) =>
  (props) => {
    return h('div', { class: 'wf-center wf-padding-xl wf-bg-secondary', style: { minHeight: '100vh' } }, [
      h(Card, { style: { width: '100%', maxWidth: '360px' } }, [
        h('div', { class: 'wf-stack wf-gap-sm wf-text-center wf-margin-bottom-lg' }, [
          props.logo ? h('div', { class: 'wf-center' }, props.logo) : null,
          h('div', { class: 'wf-font-2xl wf-semibold' }, props.title),
          props.subtitle ? h('div', { class: 'wf-font-sm wf-text-secondary' }, props.subtitle) : null,
        ]),
        props.error ? h(Alert, { variant: 'error' }, props.error) : null,
        h('form', { onSubmit: (e: any) => { e.preventDefault(); props.onSubmit?.() } }, [
          h('div', { class: 'wf-stack wf-gap-md' }, [
            props.children,
            h(Button, { type: 'submit', variant: 'primary', loading: props.loading, disabled: props.loading, block: true }, props.submitLabel),
          ]),
        ]),
        props.footer ? h('div', { class: 'wf-text-center wf-margin-top-md wf-font-sm' }, props.footer) : null,
      ]),
    ])
  }
