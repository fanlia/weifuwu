import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { clampToViewport } from '../ui-dom/popup.ts'
const browser = createClientBrowser()

before(setupJsdom)

/**
 * clampToViewport — 弹层视口夹紧（fixed 定位弹层超高/超宽时，底部/右侧内容不可点问题）。
 *
 * 真实场景：DatePicker datetime/range 面板 ~416px 高，锚点在页面中部时
 * bottom 超出视口 → 确定/取消按钮在视口外，无法点击（components-demo 实测复现）。
 * 修复在 popup.ts 通用工具层：任何使用 usePopupPosition 的组件均可受益。
 */
describe('popup clampToViewport', () => {
  const vw = browser.viewportWidth() // jsdom: 1024
  const vh = browser.viewportHeight() // jsdom: 768

  // jsdom 无真实布局：getBoundingClientRect 恒为 0，需 mock 面板尺寸
  function fakePanel(w: number, h: number, top: number, left: number) {
    return {
      offsetWidth: w,
      offsetHeight: h,
      style: { top: '', left: '' },
      getBoundingClientRect: () => ({ top, left, bottom: top + h, right: left + w }) as DOMRect,
    } as unknown as HTMLElement
  }

  it('面板超出视口底部 → 上移夹紧（footer 按钮回到视口内）', () => {
    // 锚点 y=700，面板 416px → bottom=1116 > 768 → top 夹到 768-416-8=344
    const pos = clampToViewport({ top: 700, left: 50 }, fakePanel(260, 416, 700, 50), 8)
    assert.equal(pos.top, vh - 416 - 8)
    assert.equal(pos.left, 50) // 水平不受影响
  })

  it('面板当前在旧坐标（初始 0），目标位置会溢出 → 按目标位置夹紧', () => {
    // 首开：面板还在 top:0（初始 pos），目标 top=700 → 面板在 700 处 bottom=1116 溢出
    const panel = {
      offsetWidth: 260, offsetHeight: 416,
      style: { top: '0px', left: '0px' },
      getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 416, right: 260 }) as DOMRect,
    } as unknown as HTMLElement
    const pos = clampToViewport({ top: 700, left: 50 }, panel, 8)
    assert.equal(pos.top, vh - 416 - 8)
  })

  it('面板在视口内 → 不改变坐标', () => {
    const pos = clampToViewport({ top: 200, left: 50 }, fakePanel(260, 200, 200, 50), 8)
    assert.equal(pos.top, 200)
    assert.equal(pos.left, 50)
  })

  it('面板超出视口右侧 → 左移夹紧', () => {
    // 锚点 left=900，面板 260px → right=1160 > 1024 → left 夹到 1024-260-8=756
    const pos = clampToViewport({ top: 100, left: 900 }, fakePanel(260, 100, 100, 900), 8)
    assert.equal(pos.left, vw - 260 - 8)
  })

  it('面板超过视口高度 → 夹到 margin 不越界', () => {
    // 面板 900px 比视口 768px 还高：top 夹紧下限 = margin=8
    const pos = clampToViewport({ top: 500, left: 10 }, fakePanel(100, 900, 500, 10), 8)
    assert.equal(pos.top, 8)
  })

  it('无面板元素 → 原样返回（不夹紧）', () => {
    const pos = clampToViewport({ top: 900, left: 1300 }, null, 8)
    assert.equal(pos.top, 900)
    assert.equal(pos.left, 1300)
  })
})
