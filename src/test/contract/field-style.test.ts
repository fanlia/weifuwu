/**
 * vdom core/field — applyStyle 测试（style 通道——整体替换语义）
 *
 * 锁定（2027-XX——Affix 卡 fixed 实证修复）：
 * - **对象 → undefined/null/false → 整体移除（cssText=''）**——此前 undefined
 *   分支静默 no-op → 旧 style 残留（Affix 滚回顶 sentinel --active 已移除
 *   而 content inline style 残留——两种 DOM 面不一致——滚动组件回滚失效）
 * - 对象 → 对象：先清后设（键消失不残留——display 残留事故回归锚）
 * - undefined → undefined：幂等无害（cssText 本空）
 * - 字符串：setAttribute('style', str)
 * - 既有行为回归锚：CSS 变量 setProperty / 数字 px 单位 / UNITLESS 白名单 /
 *   单键 undefined 清值（applyStyleValue）
 *
 * 零 DOM：el.style 用 FakeStyle（cssText 直读直写——node 直跑）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyStyle, applyStyleValue } from '../../client/vdom/core/field/style.ts'
import { FakeStyle } from './helpers/fake-dom.ts'

/** 鸭舌 fake element（style 通道——FakeStyle + setAttribute 转写 cssText） */
function fakeEl() {
  const style = new FakeStyle()
  const el: any = {
    style,
    setAttribute(k: string, v: string) { if (k === 'style') style.cssText = v },
    getAttribute(k: string) { return k === 'style' ? style.cssText : null },
  }
  return el as HTMLElement & { style: FakeStyle }
}

test('对象 → undefined：整体移除（cssText 清空——Affix 卡 fixed 修复回归）', () => {
  const el = fakeEl()
  applyStyle(el, { position: 'fixed', top: '0px' })
  assert.notEqual(el.style.cssText, '', '前置：对象应用后 cssText 非空')
  applyStyle(el, undefined)
  assert.equal(el.style.cssText, '', 'undefined → 旧 style 全部清空')
  assert.equal((el.style as any).position ?? '', '', 'position 键值不存在')
})

test('对象 → null/false：同整体移除语义', () => {
  for (const v of [null, false]) {
    const el = fakeEl()
    applyStyle(el, { display: 'block' })
    applyStyle(el, v)
    assert.equal(el.style.cssText, '', `${String(v)} → 清空`)
  }
})

test('对象 → 对象：先清后设——旧键消失不残留（display 残留事故回归锚）', () => {
  const el = fakeEl()
  applyStyle(el, { display: 'block', color: 'red' })
  applyStyle(el, { color: 'blue' })
  assert.equal(el.style.cssText.includes('display'), false, '旧 display 键不残留')
  assert.equal((el.style as any).color, 'blue', '新键设置')
})

test('undefined → undefined：幂等无害', () => {
  const el = fakeEl()
  applyStyle(el, undefined)
  assert.equal(el.style.cssText, '', '空 style 幂等')
})

test('字符串直通：setAttribute 语义（style 属性整体赋值）', () => {
  const el = fakeEl()
  applyStyle(el, 'color: red; top: 4px')
  assert.ok(el.style.cssText.includes('color: red'), `实际: ${el.style.cssText}`)
})

test('既有行为锚：CSS 变量 setProperty / 数字 px / UNITLESS 白名单 / 单键 undefined 清值', () => {
  const el1 = fakeEl()
  applyStyleValue(el1, 'width', 10)
  assert.equal(String((el1.style as any).width), '10px', '数字 → px')
  const el2 = fakeEl()
  applyStyleValue(el2, 'zIndex', 5)
  assert.equal(String((el2.style as any).zIndex), '5', 'UNITLESS 原样')
  const el3 = fakeEl()
  applyStyleValue(el3, '--wf-x', '1')
  assert.equal((el3.style as any).getProperty('--wf-x'), '1', 'CSS 变量 setProperty')
  const el4 = fakeEl()
  applyStyleValue(el4, 'display', 'block')
  applyStyleValue(el4, 'display', undefined)
  assert.equal(String((el4.style as any).display), '', '单键 undefined → 清值')
})
