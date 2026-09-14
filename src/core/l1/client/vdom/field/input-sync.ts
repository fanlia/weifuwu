/**
 * vdom core/field — input-sync（输入 DOM 组合态跟踪——IME 安全）
 *
 * 背景（2027-09——value 键 DOM 脱节修复的配套）：diff 对表单控件 value
 * 总是发 setProp——patch 写 DOM 前必须避开 **IME 组合中**（composition
 * 期间渲染树 value = 组合前——强写会打断输入法候选——中文输入法中断）。
 * 机制：document 捕获监听 composition 事件 → 组合中的元素 WeakSet——
 * patch 写 value 前查询（组合中跳过——组合结束后的渲染自然写回）。
 *
 * 零泄漏（WeakSet——元素可回收）；模块级单例（document 唯一——懒挂
 * 首次需要时——多次创建幂等）。
 */

let composingEls: WeakSet<HTMLElement> | null = null
const seenDocs = new WeakSet<Document>()

/** 惰性初始化（幂等——每 document 只挂一次监听） */
function ensureInit(doc: Document): WeakSet<HTMLElement> {
  if (!composingEls) composingEls = new WeakSet<HTMLElement>()
  if (!seenDocs.has(doc)) {
    seenDocs.add(doc)
    const els = composingEls
    doc.addEventListener('compositionstart', (e) => {
      const t = e.target
      if (t instanceof HTMLElement) els.add(t)
    }, true)
    doc.addEventListener('compositionend', (e) => {
      const t = e.target
      if (t instanceof HTMLElement) els.delete(t)
    }, true)
  }
  return composingEls
}

/** 输入是否处于 IME 组合中（compositionstart ~ compositionend） */
export function isComposingEl(doc: Document, el: HTMLElement): boolean {
  return ensureInit(doc).has(el)
}
