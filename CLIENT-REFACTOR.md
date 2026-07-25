# weifuwu/client 模块重构方案

每个模块的目标：**输入合法→正确运行，输入异常→有保护/有报错，状态变化→正确响应，资源用完→正确清理。**

---

## 目录

1. [Signal 系统](#1-signal-系统)
2. [JSX Runtime](#2-jsx-runtime)
3. [控制流组件（Show / For / ErrorBoundary）](#3-控制流组件)
4. [生命周期（onMount / onCleanup / MutationObserver）](#4-生命周期)
5. [Router](#5-router)
6. [Middleware（api / auth / ws）](#6-middleware)
7. [Resource / Form / Lazy](#7-resource--form--lazy)
8. [Types / App](#8-types--app)
9. [测试覆盖总表](#9-测试覆盖总表)

---

## 1. Signal 系统

### 1.1 computed 惰性求值

**当前代码**（`src/client/signal.ts:86-90`）：

```typescript
export function computed<T>(fn: () => T): Signal<T> {
  const s = signal(undefined as unknown as T)
  effect(() => { s.value = fn() })
  return s
}
```

问题：
- Effect 立即执行 → fn() 即使没人读也跑
- 依赖变化时立刻跑 fn()，即使最后读取的值不变
- 首次 `.value` 读取可能拿到 `undefined`（effect 是同步跑，但理论上有竞态）

**重构方案**：新增 `ComputedSignal` 子类，实现脏标记 + 惰性求值。

```typescript
export class ComputedSignal<T> extends Signal<T> {
  #fn: () => T
  #dirty = true

  constructor(fn: () => T, dep: Signal) {
    // 用 Signal(undefined) 的 listener 机制，但 value 由 #fn 求值
    super(undefined as unknown as T)
    this.#fn = fn
    // 订阅依赖变化 → 标记脏
    this._addDependency(dep)
  }

  get value(): T {
    // 读取时自动追踪依赖
    const v = super.value  // 确保 effect 依赖注册
    return v
  }

  /** 由依赖的 signal 调用 */
  _invalidate() {
    this.#dirty = true
    // 通知监听器值可能变了
    super._notify()
  }
}
```

实际上更简单的方案——不继承 `Signal`，用独立类：

```typescript
export class Computed<T> {
  #fn: () => T
  #dirty = true
  #cached!: T
  #deps = new Set<Signal>()
  #listeners = new Set<Listener>()
  #disposeEffect: (() => void) | null = null

  constructor(fn: () => T) {
    this.#fn = fn
    // 首次求值 + 建立依赖追踪
    this.#evaluate()
  }

  get value(): T {
    if (currentEffect) {
      // 注册为依赖，类似 Signal.value
      this.#listeners.add(currentEffect)
      currentDeps?.add(this as any)
    }
    if (this.#dirty) this.#evaluate()
    return this.#cached
  }

  #evaluate() {
    // 清理旧依赖
    for (const dep of this.#deps) dep._removeListener(this.#onDirty)
    this.#deps.clear()

    // 重新求值 + 追踪新依赖
    const prevEff = currentEffect
    const prevDeps = currentDeps
    currentEffect = this.#onDirty
    currentDeps = this.#deps
    try {
      this.#cached = this.#fn()
    } finally {
      currentEffect = prevEff
      currentDeps = prevDeps
    }
    this.#dirty = false
  }

  #onDirty = () => {
    this.#dirty = true
    // 通知所有监听器
    for (const fn of this.#listeners) fn()
  }

  _removeListener(fn: Listener) { this.#listeners.delete(fn) }
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| computed 无人读取时 fn 不执行 | fn 调用 0 次 |
| computed 被读取时 fn 执行一次 | fn 调用 1 次 |
| 依赖变化后无人读取时不跑 fn | 仅标记脏 |
| 依赖变化后有人读取时重新求值 | 返回新值 |
| 链式 computed：a→b→c，c 被读取 | 仅 a/b/c 各求值一次 |
| 链式 computed：b 依赖变化但 c 无人读 | a 重新求值，b 标记脏但不求值 |

### 1.2 循环依赖检测

**当前代码**：无保护，环导致栈溢出。

**重构方案**：effect/computed 执行时增加深度计数器。

```typescript
const MAX_EFFECT_DEPTH = 100
let _effectDepth = 0

// 在 effect() 的 run() 中：
function run() {
  _effectDepth++
  if (_effectDepth > MAX_EFFECT_DEPTH) {
    _effectDepth--
    throw new Error('[weifuwu/client] 检测到循环依赖：effect → signal → effect')
  }
  try { fn() } finally { _effectDepth-- }
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| effect 写入被监听 signal | throw Error('循环依赖') |
| computed 间接形成环 | throw Error('循环依赖') |
| 正常 effect 嵌套 50 层 | 正常运行 |
| 报错后 effect 状态恢复 | 后续 effect 可正常注册 |

### 1.3 Signal.peek()

**新增方法**：不追踪依赖地读取值。

```typescript
class Signal<T> {
  peek(): T {
    return this.#value  // 不走 get value 的依赖注册
  }
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| effect 中调用 `s.peek()` | s 变化时不触发 effect |
| 普通场景 `s.peek()` | 返回当前值 |

### 1.4 Signal edge cases

**测试覆盖**：

| 用例 | 预期 |
|------|------|
| `signal(undefined)` | `.value === undefined` |
| `signal(null)` | `.value === null` |
| 写入相同值 | listener 不触发 |
| `mutate(() => {})` 空操作 | listener 不触发 |
| dispose 后 set | listener 不触发 |
| dispose 后 mutate | listener 不触发 |
| dispose 调用两次 | 不报错 |
| batch 中 throw | `_batchDepth` 恢复为 0 |
| batch 嵌套 10 层 | 所有写入合并为一次 effect |

---

## 2. JSX Runtime

### 2.1 setProp className Signal 空值保护

**当前代码**（`jsx-runtime.ts:351-353`）：

```typescript
if (isSignal(value)) {
  _trackEffect(el, effect(() => { el.className = String(value.value) }))
}
```

问题：`String(undefined)` → `"undefined"`，`String(null)` → `"null"`。

**重构**：

```typescript
if (isSignal(value)) {
  _trackEffect(el, effect(() => {
    el.className = value.value ?? ''
  }))
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| `<div class={signal('foo')}>` | `className === 'foo'` |
| `<div class={signal('')}>` | `className === ''` |
| `<div class={signal(undefined)}>` | `className === ''` |
| `<div class={signal(null)}>` | `className === ''` |
| Signal 从 `'foo'` → `undefined` | `className` 清空 |

### 2.2 setProp Signal value/checked 空值保护

**当前代码**（`jsx-runtime.ts:363`）：

```typescript
if (key === 'value' || key === 'checked') {
  (el as any)[key] = v
}
```

问题：`(el as any)['value'] = null` 设置空字符串（浏览器行为），但 `null` 并非合法输入。

**重构**：

```typescript
if (key === 'value' || key === 'checked') {
  (el as any)[key] = v ?? ''
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| `<input value={signal('hello')}>` | `el.value === 'hello'` |
| `<input value={signal('')}>` | `el.value === ''` |
| `<input value={signal(null)}>` | `el.value === ''` |
| `<input checked={signal(true)}>` | `el.checked === true` |
| `<input checked={signal(false)}>` | `el.checked === false` |
| `<input checked={signal(null)}>` | `el.checked === false` |

### 2.3 setProp Signal 属性 removeAttribute 增强

**当前代码**（`jsx-runtime.ts:364-366`）：

```typescript
} else if (v == null || v === false) {
  el.removeAttribute(key)
}
```

现有逻辑已正确处理 `null/undefined/false` → remove attribute。无需改动。

**测试**：

| 用例 | 预期 |
|------|------|
| `<div hidden={signal(false)}>` | `hidden` 属性移除 |
| `<div hidden={signal(true)}>` | `hidden` 属性存在 |
| `<div tabindex={signal(null)}>` | `tabindex` 属性移除 |

### 2.4 appendChild Signal 在 Fragment 中的生命周期

**当前代码**（`jsx-runtime.ts:394-400`）：

```typescript
if (parentEl) {
  _trackEffect(parentEl, effect(() => { text.textContent = String(child.value) }))
} else {
  const anchor = document.createElement('div')
  anchor.style.display = 'contents'
  _trackEffect(anchor, effect(() => { text.textContent = String(child.value) }))
  anchor.appendChild(text)
  parent.appendChild(anchor)
  return
}
```

问题：`_closestElement` 在 DocumentFragment 父节点时返回 `null`，Fallback 创建额外 `display:contents` div。

**重构**：`appendChild` 应检查 `parent` 是否为 Fragment，若是则向上查找 Fragment 的宿主元素。

但 DocumentFragment 没有 `parentNode`，所以更难。更好的方案：**appendChild 在遇到 Fragment 时，直接将 Signal 子节点 append 到 Fragment 上**（Fragment 最终被 append 到某个 Element）。

```typescript
function appendChild(parent: Node, child: unknown) {
  // ... 现有 null/boolean/function/Array/Node 处理 ...

  if (isSignal(child)) {
    const text = document.createTextNode('')
    // 找到最近的 Element 锚点
    const anchor = _findAnchorElement(parent)
    if (anchor) {
      _trackEffect(anchor, effect(() => { text.textContent = String(child.value) }))
    }
    parent.appendChild(text)
    return
  }
  // ...
}

function _findAnchorElement(node: Node): Element | null {
  if (node instanceof Element) return node
  // DocumentFragment：遍历它的所有父节点（用 childList observer 桥接）
  // 当前方案：不做特殊处理，让 Fragment 自然绑定到其宿主
  return null
}
```

实际上，`display:contents` 的 fallback 方案已经能工作。核心问题在于 `_trackEffect` 中：

```typescript
export function _trackEffect(el: Element, dispose: () => void) {
  const entry = _ensure(el)
  entry.disposeFns.push(dispose)
}
```

`_ensure` 创建的 MutationObserver 观察 `document.body` 下的变化。如果 `el` 不在 body 下（刚创建未挂载），observer 会在挂载时触发 `mounted`。这个机制已正常。

所以 Fragment 中 Signal 子节点的实际问题是：Fragment 被 `el.appendChild(anchor)` 时，observer 观察的是 body 下的 `anchor` div，而不是 Fragment 本身。这个 fallback 方案工作正常。**无需修改代码，只需补充测试**。

### 2.5 toNode 完整覆盖

**当前代码**（`jsx-runtime.ts:455-467`）：

```typescript
function toNode(v: unknown): Node {
  if (v instanceof Node) return v
  if (typeof v === 'function') return toNode(v())
  if (v == null || typeof v === 'boolean') return document.createTextNode('')
  if (Array.isArray(v)) {
    const frag = document.createDocumentFragment()
    for (const child of v) frag.appendChild(toNode(child))
    return frag
  }
  return document.createTextNode(String(v))
}
```

**测试**：

| 输入 | 预期 |
|------|------|
| `Node` 实例 | 原 Node |
| `string` | `TextNode(string)` |
| `number`（0） | `TextNode("0")` |
| `number`（NaN） | `TextNode("NaN")` |
| `''` | `TextNode("")` |
| `undefined` | 空 TextNode |
| `null` | 空 TextNode |
| `true` | 空 TextNode |
| `false` | 空 TextNode |
| `Symbol()` | `TextNode("Symbol()")` |
| `[]` | DocumentFragment（空） |
| `[<div/>, <span/>]` | Fragment 含两个子节点 |
| `() => <div/>` | 函数执行结果 |
| `() => null` | 空 TextNode |

### 2.6 jsx 组件返回值保护

**当前代码**（`jsx-runtime.ts:419-425`）：

```typescript
let result: Node = document.createDocumentFragment()
try {
  result = (type as any)(merged, currentCtx) ?? document.createDocumentFragment()
} catch (err) {
  console.error(`[weifuwu/client] 组件渲染错误:`, err, { type, props })
  const fallback = document.createElement('div')
  fallback.style.display = 'contents'
  result = fallback
}
```

问题：组件返回 `null` 或 `undefined` 时已有 `??` 保护，但组件返回 `string`/`number`/`boolean` 时无保护。

**重构**：

```typescript
try {
  const compResult = (type as any)(merged, currentCtx)
  if (compResult instanceof Node) {
    result = compResult
  } else if (compResult == null || typeof compResult === 'boolean') {
    result = document.createDocumentFragment()
  } else {
    // string/number → text node
    const text = document.createTextNode(String(compResult))
    result = document.createDocumentFragment()
    ;(result as DocumentFragment).appendChild(text)
  }
} catch (err) {
  // ...
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| 组件返回 `null` | 空 fragment |
| 组件返回 `undefined` | 空 fragment |
| 组件返回 `false` | 空 fragment |
| 组件返回 `'text'` | TextNode("text") |
| 组件返回 `42` | TextNode("42") |

### 2.7 jsxDEV 增强

**当前代码**（`jsx-runtime.ts:486-507`）：已有信号缺 `.value` 检查和 For 缺 `keyBy` 警告。

**补充**：增加 source map 信息到错误日志。

```typescript
export function jsxDEV(
  type: string | Component,
  props: Record<string, unknown> | null,
  key: string | null,
  _isStatic: boolean,
  source: { fileName: string; lineNumber: number },
  _self: unknown,
): Node {
  if (process.env.NODE_ENV !== 'production') {
    const loc = source ? `${source.fileName}:${source.lineNumber}` : ''

    // 检查 prop 值中缺少 .value 的 signal
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'children' || k === 'key' || k === 'ref') continue
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node)) {
          const maybeSignal = v as any
          if (typeof maybeSignal.value !== 'undefined' && typeof maybeSignal.subscribe !== 'function') {
            console.warn(`[weifuwu/client] ⚠️ ${loc} — prop "${k}" 可能是 signal 但缺少 .value（是 ${maybeSignal.value}）`)
          }
        }
      }
    }

    // ... 现有检查 ...
  }
  return jsx(type, props, ...(props?.children ? [props.children] : []))
}
```

---

## 3. 控制流组件

### 3.1 Show 切换优化

**当前代码**（`jsx-runtime.ts:476-480`）：

```typescript
function render(show: boolean) {
  while (el.lastChild) el.removeChild(el.lastChild)
  // ...
  if (show && children != null) {
    el.appendChild(toNode(children))
  } else if (!show && fallback != null) {
    el.appendChild(toNode(fallback))
  }
}
```

逐个 `removeChild` 触发 MutationObserver。改为直接清空 innerHTML（替换前保存已有 effect）：

```typescript
function render(show: boolean) {
  // 清空子节点（触发旧子节点 MutationObserver 清理）
  while (el.lastChild) el.removeChild(el.lastChild)
  
  if (show && children != null) {
    const child = toNode(children)
    if (child instanceof DocumentFragment && child.childNodes.length > 0) {
      while (child.firstChild) el.appendChild(child.firstChild)
    } else {
      el.appendChild(child)
    }
  } else if (!show && fallback != null) {
    el.appendChild(toNode(fallback))
  }
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| `when=true` 渲染 children | 显示 children |
| `when=false` 渲染 fallback | 显示 fallback |
| `when=false` 无 fallback | 空 div |
| Signal 切换 true→false→true | children → fallback → children |
| 切换中 Signal 绑定继续响应 | Signal 变化后新 children 更新 |
| 嵌套 Show `<Show><Show>when2</Show></Show>` | 内外独立切换 |
| onCleanup 在切换时执行 | 旧子节点的 cleanup 被调用 |
| onMount 在新子节点上执行 | 新子节点的 mount 被调用 |

### 3.2 For 内容变化检测

**当前代码**（`jsx-runtime.ts:532-546`）：

```typescript
if (existing && (existing as any)._wfData === newItems[i]) {
  el.insertBefore(existing, insertBefore)
  insertBefore = existing
} else {
  const node = children(newItems[i], i)
  // ...
}
```

问题：`(existing as any)._wfData === newItems[i]` 引用相同时不更新内容。

**重构**：对基本类型（string/number）做值比较，检测到变化时更新节点。

```typescript
if (existing && (existing as any)._wfData === newItems[i]) {
  // 引用相同 — 检查内容是否变化（仅对原始值）
  const oldData = (existing as any)._wfData
  const newItem = newItems[i]
  if (typeof oldData === 'string' || typeof oldData === 'number') {
    if (oldData !== newItem) {
      // 内容变了，重建
      const newNode = children(newItem, i)
      if (newNode instanceof Element) {
        newNode.setAttribute('data-key', key)
        ;(newNode as any)._wfData = newItem
      }
      el.replaceChild(newNode, existing)
      insertBefore = newNode
      continue
    }
  }
  // 内容未变或引用类型 — 仅移动
  el.insertBefore(existing, insertBefore)
  insertBefore = existing
} else {
  // 引用不同或不存在 — 新建
  const node = children(newItem, i)
  if (node instanceof Element) {
    node.setAttribute('data-key', key)
    ;(node as any)._wfData = newItem
  }
  if (existing) {
    el.replaceChild(node, existing)
  } else {
    el.insertBefore(node, insertBefore)
  }
  insertBefore = node
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| `For keyed` 初始渲染 3 个 string | 3 个元素 |
| 数组尾部 push 1 个 | 仅新建 1 个，旧 3 个移动 |
| 数组移除中间 1 个 | 仅移除 1 个，其余移动 |
| 数组 `[1,2,3]` → `[10,2,3]` | 仅重建第一个（内容变） |
| 流式场景：数组 spread 旧对象后改内容 | 内容更新 |
| keyBy 字段变化 | 节点重建 |
| 列表清空 → 重新填充 | 全部新建 |

### 3.3 For 边界状态

**测试**：

| 用例 | 预期 |
|------|------|
| `each=[]` | 无子节点 |
| `each=null` | 无子节点 |
| `each=undefined` | 无子节点 |
| `each=signal([])` | 空 |
| `each=signal(null)` | 空 |
| 从 `[a,b]` → `[]` | 移除所有 |
| 从 `[]` → `[a,b]` | 新建所有 |
| 单元素列表 `[a]` → `[b]` | 替换 |

### 3.4 ErrorBoundary 增强

**当前代码**（`jsx-runtime.ts:446-462`）：已有完整实现。

**测试**：

| 用例 | 预期 |
|------|------|
| children throw | 显示 fallback |
| children 正常渲染 | 显示正常内容 |
| onError 回调 | 被调用 |
| fallback 自身 throw | console.error + 空 fallback |
| 嵌套 ErrorBoundary | 内层捕获，外层安全 |

---

## 4. 生命周期

### 4.1 MutationObserver entry 复用

**当前代码**（`jsx-runtime.ts:303-327`）：

```typescript
const _entries = new Map<Element, _Entry>()
// 元素离开 document 时 delete：
if (!now && entry!.mounted) {
  // ...
  obs.disconnect()
  _entries.delete(el)  // ← 问题：下次挂载重新创建
}
```

**重构**：入口复用——元素离开时不清除 entry，只重置状态。

```typescript
// 保持 entry 存在，仅重置状态
if (!now && entry!.mounted) {
  entry!.mounted = false
  for (const fn of entry!.disposeFns) fn()
  entry!.disposeFns = []
  entry!.mountFns = []
  // 不 disconect observer，不 delete entry
  // 下次挂载时继续使用同一个 observer
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| 组件移除后重新挂载 | onMount 再次触发 |
| 组件反复移入/移出 10 次 | 每次正确触发，不创建 10 个 observer |
| 组件在 Fragment 中 | Fragment 被 append 到 body 后触发 onMount |
| 嵌套组件同时 mount | 子组件先 mount，父后 mount |
| Signal effect 在元素移除后清理 | 移除后 effect 不执行 |

### 4.2 生命周期回调顺序文档化

当前行为：子组件先 mount（因为子 jsx 先执行），后父组件 mount。

```typescript
// jsx(父, props, jsx(子)) → 参数先求值 → 子 jsx 先执行 → 子先注册 onMount
// 父 jsx 后执行 → 父后注册 onMount
// MutationObserver 检测到根元素挂载 → 执行所有注册的 onMount → 父后注册所以后执行
```

实际最终顺序：**父 → 子**（父的 `_ensure` 在子之上，父注册的观察器先触发）。

无需改动，但需文档化并测试。

**测试**：

| 用例 | 预期 |
|------|------|
| 父组件含子组件 | 子 onMount 先注册，父 onCleanup 先清理（LIFO）|

### 4.3 onMount/onCleanup 多次调用

**测试**：

| 用例 | 预期 |
|------|------|
| 同一组件调用 2 次 onMount | 两个回调都执行 |
| 同一组件调用 3 次 onCleanup | 元素移除时 3 个都执行 |
| onMount 在非组件函数中调用（没有 `_pendingMountQueue`）| 静默跳过，不报错 |
| onCleanup 在非组件函数中调用 | 静默跳过 |
| onMount 返回清理函数 | 元素移除时执行 |

---

## 5. Router

### 5.1 router destroy 方法

**当前代码**（`router.ts`）：`addEventListener('popstate')` / `addEventListener('hashchange')` 无清理。

**重构**：在 router 闭包中保存 `cleanup` 函数，返回 `destroy()` 方法。

```typescript
export function router(opts: RouterOptions): AppMiddleware {
  // ... 现有逻辑 ...

  // 收集需要清理的事件监听
  const cleanupFns: (() => void)[] = []

  if (mode === 'hash') {
    const handler = () => { /* ... */ }
    window.addEventListener('hashchange', handler)
    cleanupFns.push(() => window.removeEventListener('hashchange', handler))
  } else {
    const handler = () => { /* ... */ }
    window.addEventListener('popstate', handler)
    cleanupFns.push(() => window.removeEventListener('popstate', handler))
  }

  // 注入 destroy 到 app
  return (ctx: WfuiContext): WfuiContext => {
    // ...
    const app = ctx.app
    app.destroy = () => {
      for (const fn of cleanupFns) fn()
    }
    // ...
  }
}
```

### 5.2 hash 模式 URL 同步改进

**当前代码**（`router.ts:155`）：`window.location.hash = '#' + path` 直接赋值，不触发 `hashchange`。

**重构**：使用 `HashChangeEvent` 手动触发。

实际上浏览器在 `location.hash = '#'` 时会自动触发 `hashchange`。但如果目标是同一个 hash，不会触发。需要额外处理：

```typescript
ctx.app.navigate = (path: string) => {
  const hash = '#' + path
  if (window.location.hash !== hash) {
    window.location.hash = hash
  } else {
    // 相同 hash 也要触发渲染
    navigateAndLoad(path)
  }
}
```

### 5.3 路由参数 + query 参数测试

**测试**：

| 用例 | 预期 |
|------|------|
| route `/user/:id` + path `/user/42` | `ctx.route.params.id === '42'` |
| route `/user/:id/post/:postId` | 两个参数都正确 |
| query `?page=1&limit=20` | `ctx.route.query.page === '1'` |
| 无匹配路由 | 显示 not-found 组件（配置时） |
| hash 模式路由匹配 | 正确匹配 |
| navigate 后路由更新 | 组件重新渲染 |
| 嵌套路由 `/admin/users` | 正确匹配嵌套 `children` |
| router.destroy 后 navigat 不触发 | 无操作 |

---

## 6. Middleware

### 6.1 api middleware 测试增强

**当前测试**：有基本 GET/POST/PUT/DELETE 测试。

**补充测试**：

| 用例 | 预期 |
|------|------|
| 网络错误（fetch throw） | ApiError |
| 非 JSON 响应（plain text） | 正确 parse |
| 响应 status >= 400 | ApiError |
| 自定义 headers | 请求中携带 |
| baseURL 拼接 | 正确拼接 |
| 超时场景 | reject |

### 6.2 auth middleware 测试增强

**当前测试**：有登录/登出基础测试。

**补充测试**：

| 用例 | 预期 |
|------|------|
| token 过期自动刷新 | 调用 refresh endpoint |
| 刷新失败（过期 refresh token）| 自动登出 |
| 多个请求并发时只刷新一次 | 一次 refresh，多个等待 |
| 登出后清除存储 | localStorage 清理 |
| 页面加载时过期 token 刷新 | 自动调用 refresh |

### 6.3 ws middleware 测试增强

**当前测试**：无（`ws.test.ts` 不存在）。

**补充测试**：

| 用例 | 预期 |
|------|------|
| send 消息 | WS.send 被调用 |
| onMessage 接收 | handler 被调用 |
| 连接关闭后恢复 | 自动重连 |
| 重连后发送队列 | 队列中消息重发 |
| 多个 handler 注册 | 都收到消息 |
| cleanup 移除 handler | 不再接收 |
| ping/pong 超时 | 自动重连 |
| 达到最大重连次数 | 停止重连 |

### 6.4 ws 重连 subscribe

**当前问题**：框架本身不提供自动 re-subscribe 机制。是否应该在 WS 中间件中增加 `rooms` API？

**重构**：在 ws middleware 中增加 `subscribe(room)` / `unsubscribe(room)` 方法，自动在重连时重新加入。

```typescript
export function ws(opts): AppMiddleware {
  return (ctx) => {
    const rooms = new Set<string>()

    function connect() {
      // ...
      socket.onopen = () => {
        isConnected.value = true
        // 重连后重新加入所有房间
        for (const room of rooms) {
          socket!.send(JSON.stringify({ type: 'subscribe', departmentId: room }))
        }
        // ...
      }
    }

    return extendCtx(ctx, {
      ws: {
        send,
        onMessage,
        subscribe: (room: string) => {
          rooms.add(room)
          send({ type: 'subscribe', departmentId: room })
        },
        unsubscribe: (room: string) => {
          rooms.delete(room)
          send({ type: 'unsubscribe', departmentId: room })
        },
        isConnected,
      },
    })
  }
}
```

---

## 7. Resource / Form / Lazy

### 7.1 createResource 竞态条件 + AbortController

**当前代码**（`resource.ts`）：使用 fetchId 计数器防止竞态，但无 AbortController。

**重构**：增加 AbortController 支持和手动取消。

```typescript
export function createResource<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options?: ResourceOptions<T>,
): [Signal<T | undefined>, ResourceState<T>] {
  let fetchId = 0
  let abortController: AbortController | null = null

  async function load() {
    // 取消上一次请求
    abortController?.abort()
    abortController = new AbortController()
    const signal = abortController.signal

    const id = ++fetchId
    loading.value = true
    error.value = undefined

    try {
      const result = await fetcher(signal)
      if (id === fetchId && !signal.aborted) {
        data.value = result
        loading.value = false
      }
    } catch (e) {
      if (id === fetchId && !signal.aborted) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        error.value = e instanceof Error ? e : new Error(String(e))
        loading.value = false
      }
    }
  }

  load()

  return [data, {
    data, loading, error,
    refetch: () => { load() },
    cancel: () => { abortController?.abort() },
  }]
}
```

**测试**：

| 用例 | 预期 |
|------|------|
| 正常加载 | data 设置，loading=false |
| 加载失败 | error 设置 |
| refetch | 重新请求 |
| 竞态（快速连续 refetch）| 只有最后一次的结果生效 |
| AbortController | 请求被取消，不影响 state |
| 取消后不设置 error | error 保持 undefined |

### 7.2 form 动态验证 + 字段数组

**当前代码**（`form.ts`）：可读，但缺少动态验证规则变化。

**测试**：

| 用例 | 预期 |
|------|------|
| 初始值 | 字段正确绑定 |
| 输入更新值 | values 信号更新 |
| 验证通过 | errors 为空 |
| 验证失败 | errors 有对应字段错误 |
| 验证规则动态变化 | 新规则生效 |
| 提交成功 | onSubmit 被调用 |
| 提交失败（throw）| onSubmit 返回错误 |
| 重置 | 回到初始值 |
| 字段数组 `items[]` | 增删字段正常 |
| 嵌套字段 `user.name` | 正确绑定 |
| 异步验证 | loading 状态 |

### 7.3 lazy 错误恢复

**当前代码**（`lazy.ts`）：已读，有基本加载/错误处理。

**测试**：

| 用例 | 预期 |
|------|------|
| 加载成功 | 组件正常渲染 |
| 加载失败 | 显示 error 状态或 fallback |
| 组件卸载时清理 | cleanup 执行 |
| 多次加载同一组件 | 只加载一次 |
| 加载完成后 unmount | 正常 unmount |

---

## 8. Types / App

### 8.1 WfuiContext 类型完善

**当前代码**（`types.ts`）：

**补充**：`app.destroy` 方法签名。

```typescript
export interface WfuiApp {
  use(mw: AppMiddleware): WfuiApp
  mount(selector: string, root: Component): Promise<void>
  destroy(): void
}

export interface WfuiContext {
  // ... 现有字段 ...
  app: WfuiApp
  ws?: {
    send: (data: unknown) => void
    onMessage: (handler: (data: unknown) => void) => () => void
    isConnected: Signal<boolean>
    subscribe?: (room: string) => void
    unsubscribe?: (room: string) => void
  }
}
```

### 8.2 createApp destroy 方法

**当前代码**（`app.ts`）：无 destroy 方法。

**重构**：

```typescript
export function createApp(): WfuiApp {
  const middlewares: AppMiddleware[] = []
  let destroyed = false
  let destroyHandlers: (() => void)[] = []

  const app: WfuiApp = {
    use(mw) {
      middlewares.push(mw)
      return app
    },

    onDestroy(fn: () => void) {
      destroyHandlers.push(fn)
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      for (const fn of destroyHandlers) fn()
      destroyHandlers = []
    },

    async mount(selector, root) {
      // ... 现有逻辑 ...
    },
  }

  return app
}
```

---

## 9. 测试覆盖总表

| 模块 | 现有 test | 目标 test | 关键新增 |
|------|-----------|-----------|----------|
| signal | 9 | 30 | computed 惰性/循环/peek/edge case |
| jsx-runtime | ~40 | 80 | setProp 空值/toNode/组件返回值/appendChild |
| Show | 3 | 12 | 嵌套/反复切换/生命周期 |
| For | 4 | 15 | 流式内容/边界/keyed 重排 |
| ErrorBoundary | 3 | 6 | 嵌套/fallback throw/链式 |
| 生命周期 | ~15 | 25 | 反复 mount/顺序/multiple callback |
| router | ~15 | 25 | destroy/hash 同步/参数 |
| api | 10 | 18 | 超时/网络错误/自定义 header |
| auth | 8 | 16 | 自动刷新/并发/登出清理 |
| ws | 0 | 12 | 重连/消息队列/房间 |
| form | 10 | 18 | 动态验证/字段数组/异步 |
| resource | 5 | 12 | AbortController/竞态 |
| lazy | 4 | 8 | 错误恢复/重复加载 |
| app | 3 | 6 | destroy/middleware 链 |

**总计**：1798 行 → 3500+ 行，约 260+ tests

---

## 10. 执行步骤

```
Step 1: signal.ts 重构（computed 惰性 + 循环检测 + peek）
Step 2: signal.test.ts 增强（30 tests）
        → npm test 通过

Step 3: jsx-runtime.ts 修复（setProp 空值 + 组件返回值）
Step 4: jsx-runtime.test.ts 增强（80 tests）
        → npm test 通过

Step 5: lifecycle 重构（entry 复用 + 顺序文档化）
Step 6: lifecycle.test.ts 增强（25 tests）
        → npm test 通过

Step 7: For 内容变化检测
Step 8: For/Show 测试增强（27 tests）
        → npm test 通过

Step 9: router destroy + hash 同步
Step 10: router.test.ts 增强（25 tests）
         → npm test 通过

Step 11: api/auth/ws 测试补充（46 tests）
Step 12: form/resource/lazy 测试补充（38 tests）
         → npm test 全部通过（260+ tests）

Step 13: types + app destroy 补充
         → tsc --noEmit 通过

Step 14: agent-platform 构建 + curl 回归测试
```
