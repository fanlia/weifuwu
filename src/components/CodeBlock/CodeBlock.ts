/**
 * weifuwu/components — CodeBlock
 *
 * 代码展示块：语言标签 + 复制按钮 + 横向滚动。
 * 由 Markdown 代码围栏复用；也可独立使用。
 * 裁剪：不做语法高亮（零依赖，语言标签仅展示）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CodeBlockProps {
  code: string
  lang?: string
  title?: string
}

export const CodeBlock: Component<CodeBlockProps> = (_init, ctx) => {
  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let latestCode = ''

  const copy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(latestCode)
      } else {
        // 降级：execCommand（clipboard API 不可用环境）
        const ta = document.createElement('textarea')
        ta.value = latestCode
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      copied = true
      ctx.ui.render()
      clearTimeout(timer)
      timer = setTimeout(() => { copied = false; ctx.ui.render() }, 1600)
    } catch {
      /* 复制失败静默（剪贴板权限拒绝等） */
    }
  }

  return (props: CodeBlockProps) => {
    const { code, lang, title } = props
    latestCode = code

    const langEl = lang
      ? h('span', { class: 'wf-codeblock-lang' }, [h('span', { class: 'wf-codeblock-dot' }), lang])
      : null

    const copyBtn = h('button', {
      class: 'wf-codeblock-copy',
      type: 'button',
      'aria-label': '复制',
      title: '复制代码',
      onClick: copy,
    }, copied ? h(Icon, { name: 'check', size: 14 }) : h(Icon, { name: 'copy', size: 14 }))

    const header = h('div', { class: 'wf-codeblock-header' }, [
      h('span', { class: 'wf-codeblock-title' }, title ?? langEl ?? '代码'),
      copyBtn,
    ].filter(Boolean))

    const pre = h('pre', { class: 'wf-codeblock-pre' },
      h('code', { class: 'wf-codeblock-code' }, code))

    return h('div', { class: 'wf-codeblock' }, [header, pre])
  }
}
