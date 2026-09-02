/**
 * weifuwu/components — Result
 *
 * 结果页：status + title + desc + extra（操作按钮区）。
 * 用于注册完成/操作成功/404/403 页。
 * 裁剪（CS-05，见 docs/client.md）：不做内置路由跳转（页面自身处理）。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'

export type ResultStatus = 'success' | 'error' | 'warning' | 'info'

export interface ResultProps {
  status?: ResultStatus
  title: any
  desc?: any
  extra?: any
  className?: string
}

const ICON: Record<ResultStatus, IconName> = {
  success: 'check',
  error: 'close',
  warning: 'alert',
  info: 'info',
}

export const Result: Component<ResultProps> = (_init, _ctx) =>
  (props) => {
    const { status = 'info', title, desc, extra, className } = props

    return h('div', { class: `wf-result wf-result--${status}${className ? ` ${className}` : ''}` }, [
      h('div', { class: 'wf-result-icon', 'aria-hidden': 'true' }, h(Icon, { name: ICON[status], size: 40 })),
      h('div', { class: 'wf-result-title' }, title),
      desc ? h('div', { class: 'wf-result-desc' }, desc) : null,
      extra ? h('div', { class: 'wf-result-extra' }, extra) : null,
    ].filter(Boolean))
  }
