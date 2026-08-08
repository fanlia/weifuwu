import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export type TextType = 'secondary' | 'success' | 'warning' | 'danger'

export interface TitleProps {
  /** 1-5，默认 1（h1-h5） */
  level?: 1 | 2 | 3 | 4 | 5
  children?: any
  className?: string
  style?: Record<string, string>
  [key: string]: any
}

export interface TextProps {
  type?: TextType
  strong?: boolean
  underline?: boolean
  /** 删除线 */
  strikethrough?: boolean
  /** 高亮底色 */
  mark?: boolean
  /** 行内代码 */
  code?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  children?: any
  className?: string
  [key: string]: any
}

export interface ParagraphProps {
  type?: TextType
  /** 单行截断（ellipsis） */
  ellipsis?: boolean
  children?: any
  className?: string
  [key: string]: any
}

/** 标题（对应 antd/EP Typography.Title） */
export const Title: Component<TitleProps> = (_init) =>
  (props) => {
    const { level = 1, children, className, style, ...rest } = props
    return h(`h${level}`, {
      class: [`wf-title`, `wf-title--${level}`, className].filter(Boolean).join(' '),
      style,
      ...rest,
    }, children)
  }

/** 行内文本（对应 antd/EP Typography.Text） */
export const Text: Component<TextProps> = (_init) =>
  (props) => {
    const {
      type, strong, underline, strikethrough, mark, code, size,
      children, className, ...rest
    } = props
    const classes = ['wf-text']
    if (type) classes.push(`wf-text--${type}`)
    if (strong) classes.push('wf-text--strong')
    if (underline) classes.push('wf-text--underline')
    if (strikethrough) classes.push('wf-text--strike')
    if (mark) classes.push('wf-text--mark')
    if (code) classes.push('wf-text--code')
    if (size && size !== 'md') classes.push(`wf-text--${size}`)
    if (className) classes.push(className)
    return h('span', { class: classes.join(' '), ...rest }, children)
  }

/** 段落（对应 antd/EP Typography.Paragraph） */
export const Paragraph: Component<ParagraphProps> = (_init) =>
  (props) => {
    const { type, ellipsis, children, className, ...rest } = props
    const classes = ['wf-paragraph']
    if (type) classes.push(`wf-text--${type}`)
    if (ellipsis) classes.push('wf-paragraph--ellipsis')
    if (className) classes.push(className)
    return h('p', { class: classes.join(' '), ...rest }, children)
  }
