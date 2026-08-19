/**
 * VideoPlayer — 视频播放器（原生 video 封装——零依赖）
 *
 * 用法：<VideoPlayer src={url} poster={cover} onEnded={...} />
 * 能力：controls 原生控制 / poster 封面 / 宽高比容器 / 事件回调
 * 裁剪边界：非 IDE 级播放器（无字幕/倍速菜单/画中画定制——原生能力透传）
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface VideoPlayerProps {
  src: string
  poster?: string
  /** 宽高比（默认 16/9） */
  aspect?: number
  controls?: boolean
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  /** 事件回调 */
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onError?: (err: Error) => void
  className?: string
}

export const VideoPlayer: Component<VideoPlayerProps> = async (_init, ctx) => {
  let el: HTMLVideoElement | null = null
  const attachRef = (node: HTMLElement | null) => {
    el = node as HTMLVideoElement | null
  }
  return async (props) => {
    const { src, poster, aspect = 16 / 9, controls = true, autoPlay, loop, muted, onPlay, onPause, onEnded, onError, className = '' } = props
    const wrapRef = (node: HTMLElement | null) => {
      attachRef(node)
      if (node) {
        const v = node.querySelector('video')
        if (v) {
          v.onplay = () => onPlay?.()
          v.onpause = () => onPause?.()
          v.onended = () => onEnded?.()
          v.onerror = () => onError?.(new Error('视频加载失败'))
        }
      }
    }
    return h('div', {
      class: `wf-videoplayer wf-surface wf-border wf-rounded-md wf-clip${className ? ` ${className}` : ''}`,
      style: { aspectRatio: String(aspect), background: '#000' },
      ref: wrapRef,
    },
      h('video', {
        src, poster,
        controls, autoPlay, loop, muted,
        playsinline: true,
        preload: 'metadata',
        style: { width: '100%', height: '100%', display: 'block' },
      }))
  }
}
