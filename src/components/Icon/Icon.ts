/**
 * weifuwu/components — Icon 内联 SVG 图标
 *
 * 24px stroke 风格（feather-like），currentColor 着色随文字/上下文，
 * 零外部依赖（FS-05）。组件内部图标统一走这里，替换文本字形/emoji。
 *
 * 用法：
 *   h(Icon, { name: 'close' })
 *   h(Icon, { name: 'check', size: 16 })
 */

import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export type IconName =
  | 'chevron-down' | 'chevron-up' | 'chevron-left' | 'chevron-right'
  | 'arrow-left' | 'arrow-up' | 'arrow-down'
  | 'sort' | 'sort-asc' | 'sort-desc'
  | 'check' | 'close' | 'alert' | 'info' | 'warning'
  | 'pause' | 'settings' | 'search' | 'send' | 'stop'
  | 'retry' | 'upload' | 'trash' | 'edit' | 'plus'

export interface IconProps {
  name: IconName
  /** 尺寸，默认 1em（随字号缩放） */
  size?: number | string
  className?: string
}

const PATHS: Record<IconName, string[]> = {
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  sort: ['M7 15l5 5 5-5', 'M7 9l5-5 5 5'],
  'sort-asc': ['M12 19V5', 'M5 12l7-7 7 7'],
  'sort-desc': ['M12 5v14', 'M19 12l-7 7-7-7'],
  check: ['M20 6L9 17l-5-5'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  warning: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  stop: ['M6 6h12v12H6z'],
  retry: ['M1 4v6h6', 'M23 20v-6h-6', 'M20.49 9A9 9 0 0 0 5.64 5.64L1 10', 'M3.51 15a9 9 0 0 0 14.85 3.36L23 14'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14', 'M10 11v6', 'M14 11v6'],
  edit: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  plus: ['M12 5v14', 'M5 12h14'],
}

export const Icon: Component<IconProps> = (_init, _ctx) =>
  (props) => {
    const { name, size, className } = props
    return h('svg', {
      class: `wf-icon${className ? ' ' + className : ''}`,
      width: size ?? '1em',
      height: size ?? '1em',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    }, PATHS[name].map(d => h('path', { d })))
  }
