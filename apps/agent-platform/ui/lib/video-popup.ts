/**
 * 视频弹窗播放（2026-09——与图片 Img preview 同机制：openPopup mask 全屏）
 *
 * 用法：openVideoPopup(ctx, blobUrl, '文件名') —— 弹窗内容 = 内置 VideoPlayer
 * （weifuwu/components——原生 controls 封装——零依赖）
 *
 * 注：blob URL（鉴权文件端点 fetch 后转对象 URL）——消息/交付物/文件卡
 * 三面共用同一弹窗形态——<video src> 无法带 Bearer——blob 是唯一路径。
 */
import { VideoPlayer } from 'weifuwu/components'
import { h } from 'weifuwu/vdom'

export function openVideoPopup(ctx: { ui: { openPopup: Function } }, url: string, title: string): void {
  ctx.ui.openPopup({
    key: 'video-preview',
    mask: true,
    maskCentered: true,
    content: () => h('div', {
      class: 'wf-stack wf-gap-sm',
      style: 'width: min(860px, 92vw);',
    }, [
      h('div', { class: 'wf-font-sm wf-semibold wf-text-primary wf-truncate' }, title),
      h('div', { class: 'wf-radius wf-border', style: 'width: 100%;' },
        h(VideoPlayer, { src: url, autoPlay: true })),
    ]),
  })
}
