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
  let latest: VideoPlayerProps = { src: '' }
  // **video 元素自身 ref（mount 定义——稳定——§5.1 纪律）**：
  // 真实 bug 1：ref 绑在 div——ref 在 appendChild 前触发（video 子元素
  // 未渲染）→ querySelector('video') null → onplay/onerror 从未绑定
  // （onPlay 回调永不触发）——ref 直接绑 video（触发时元素存在）
  // 真实 bug 2：muted 属性经 setAttribute 渲染——Chrome 对 video.muted
  // 的 setAttribute 不生效（IDL 恒 false——实测）→ muted autoplay 被阻止
  // ——IDL 直接设置（v.muted = true）
  const videoRef = (node: HTMLVideoElement | null) => {
    el = node
    if (node) {
      node.onplay = () => latest.onPlay?.()
      node.onpause = () => latest.onPause?.()
      node.onended = () => latest.onEnded?.()
      node.onerror = () => latest.onError?.(new Error('视频加载失败'))
      // IDL 同步（Chrome setAttribute 对 muted/loop/autoplay 不生效）
      if (latest.muted !== undefined) node.muted = latest.muted
      if (latest.loop !== undefined) node.loop = latest.loop
      if (latest.autoPlay !== undefined) node.autoplay = latest.autoPlay
    }
  }
  return async (props) => {
    latest = props
    const { src, poster, aspect = 16 / 9, controls = true, autoPlay, loop, muted, className = '' } = props
    // 渲染后 IDL 同步（props 动态变化——ref 稳定不重触发——afterRender 幂等）
    ctx.afterRender?.(() => {
      if (el && latest.muted !== undefined) el.muted = latest.muted
      if (el && latest.loop !== undefined) el.loop = latest.loop
      if (el && latest.autoPlay !== undefined) el.autoplay = latest.autoPlay
    })
    return h('div', {
      class: `wf-videoplayer wf-surface wf-border wf-rounded-md wf-clip${className ? ` ${className}` : ''}`,
      style: { aspectRatio: String(aspect), background: '#000' },
    },
      h('video', {
        src, poster,
        controls, autoPlay, loop, muted,
        playsinline: true,
        preload: 'metadata',
        ref: videoRef,
        style: { width: '100%', height: '100%', display: 'block' },
      }))
  }
}
