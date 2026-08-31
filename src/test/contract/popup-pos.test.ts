/**
 * popup 定位契约——computePos 参数矩阵（VDOM-CORE-EXCELLENCE 波次 C2）
 *
 * computePos 是纯函数（锚 rect + 视口 + 面板尺寸 → {top,left}）——
 * popup-manager 定位核心（openPopup/Tooltip/DatePicker 面板共用）。
 *
 * 锁定矩阵（零浏览器——fake rect/win）：
 * - placement 四方向（bottom/top/left/right）+ center 语义
 *   （left/right 垂直居中——Tooltip 用户实测「顶部对齐 vs 按钮中心
 *   对不上」——统一 center 语义回归）
 * - center=false 形态（左对齐/顶对齐）
 * - 视口夹紧（右/左/下溢出——margin 保留）
 * - 0-rect 防护（null——保留上一坐标——A.4 教训：scroll/ref 间隙）
 *
 * 配套：popup-phase.test.ts（reducer/时间线回放 6 条）——合计 popup
 * 契约 14 条（VDOM-CORE-EXCELLENCE C2 验收 ≥8）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePos } from '../../client/vdom/hooks/popup.ts'

/** fake 锚元素（getBoundingClientRect 固定值） */
function fakeAnchor(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  const r = { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect
  return { getBoundingClientRect: () => r } as unknown as HTMLElement
}
/** fake 视口 */
function fakeWin(w: number, h: number): Window {
  return { innerWidth: w, innerHeight: h } as unknown as Window
}

const ANCHOR = { left: 500, top: 300, width: 100, height: 40 }
const VIEW = [1280, 800] as const

test('computePos bottom：锚下方 + gap + 水平居中（center 默认）', () => {
  const p = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'bottom', 8, 8, true)
  assert.equal(p!.top, 300 + 40 + 8, 'top = 锚 bottom + gap')
  assert.equal(p!.left, 500 + 50 - 100, 'left = 锚中心 - 面板半宽')
})

test('computePos top：锚上方（top = 锚 top - 面板高 - gap）', () => {
  const p = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'top', 8, 8, true)
  assert.equal(p!.top, 300 - 100 - 8)
  assert.equal(p!.left, 500 + 50 - 100)
})

test('computePos left：锚左侧 + 垂直居中（Tooltip center 语义——用户实测回归）', () => {
  const p = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'left', 8, 8, true)
  assert.equal(p!.left, 500 - 200 - 8)
  assert.equal(p!.top, 300 + 20 - 50, 'top = 锚垂直中心 - 面板半高（顶部对齐 vs 中心对齐实证）')
})

test('computePos right：锚右侧 + gap + 垂直居中', () => {
  const p = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'right', 8, 8, true)
  assert.equal(p!.left, 500 + 100 + 8)
  assert.equal(p!.top, 300 + 20 - 50)
})

test('computePos center=false：left/right 顶对齐 + bottom 左对齐（形态回归）', () => {
  const l = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'left', 8, 8, false)
  assert.equal(l!.top, 300, 'left center=false = 锚 top（顶对齐）')
  const b = computePos(fakeAnchor(ANCHOR), fakeWin(...VIEW), 200, 100, 'bottom', 8, 8, false)
  assert.equal(b!.left, 500, 'bottom center=false = 锚 left（左对齐）')
})

test('computePos 视口夹紧：右溢出 → margin 内收', () => {
  // left = 1200+50-100 = 1150——1150+200 = 1350 > 1272（win-margin）→ 夹紧
  const p = computePos(fakeAnchor({ left: 1200, top: 300, width: 100, height: 40 }), fakeWin(...VIEW), 200, 100, 'bottom', 8, 8, true)
  assert.equal(p!.left, 1280 - 200 - 8, '右溢出夹紧 win - panelW - margin')
  // 左缘 < margin → margin
  const p2 = computePos(fakeAnchor({ left: 2, top: 300, width: 100, height: 40 }), fakeWin(...VIEW), 200, 100, 'bottom', 8, 8, true)
  assert.equal(p2!.left, 8, '左溢出夹紧 = margin')
})

test('computePos 视口夹紧：下溢出 → margin 内收（bottom 面板超视口）', () => {
  const p = computePos(fakeAnchor({ left: 500, top: 700, width: 100, height: 40 }), fakeWin(1280, 800), 200, 200, 'bottom', 8, 8, true)
  assert.equal(p!.top, 800 - 200 - 8, '下溢出夹紧 win - panelH - margin')
})

test('computePos 0-rect 防护：null（保留上一坐标——A.4 scroll/ref 间隙教训）', () => {
  const p = computePos(fakeAnchor({ left: 0, top: 0, width: 0, height: 0 }), fakeWin(...VIEW), 200, 100, 'bottom', 8, 8, true)
  assert.equal(p, null, '0×0 rect 返回 null——调用方保留上一坐标')
})
