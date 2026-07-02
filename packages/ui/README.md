# @weifuwujs/ui

**Reactive UI for weifuwu** — `h()`, `ref()`, `render()`.

A minimal, zero-build frontend runtime. Same philosophy as `@weifuwujs/core`:
standard Web APIs, no compilation, no virtual DOM.

```
npm install @weifuwujs/ui
```

## Core API

| Function | Purpose |
|---|---|
| `h(tag, attrs, ...children)` | Create DOM element (like `document.createElement`) |
| `ref(initial)` | Reactive state container |
| `computed(fn)` | Derived reactive value |
| `effect(fn)` | Auto-tracking side effect |
| `render(container, fn)` | Mount template once |
| `reactiveRender(container, fn)` | Mount with reactive updates |
| `bind(signal)` | Two-way form binding |
| `text(content)` | Create text node |
| `fragment(...children)` | Create DocumentFragment |

## Quick start

### Server

```ts
import { weifuwuiAssets } from '@weifuwujs/ui'

app.use('/_ui', weifuwuiAssets())
// Serves:
//   /_ui/weifuwu-ui.js   — Runtime (h, ref, render, stores)
//   /_ui/weifuwu-ui.css  — CSS components
```

### Browser

```html
<link rel="stylesheet" href="/_ui/weifuwu-ui.css" />
<script defer src="/_ui/weifuwu-ui.js"></script>
<script id="__wui-data" type="application/json">
  {"theme":"light","locale":"en","messages":{}}
</script>
<div id="app"></div>
<script>
  const { ref, h, render } = weifuwu

  const count = ref(0)
  render(document.getElementById('app'), () =>
    h('button', {
      class: 'wui-btn wui-btn--primary',
      onclick: () => { count.value++ },
    }, 'Count: ', count)
  )
</script>
```

## h() — DOM element factory

```ts
// Basic element
h('h1', null, 'Hello')

// With attributes
h('input', {
  type: 'text',
  placeholder: 'Enter name',
  value: name,       // Signal → reactive binding
  oninput: (e) => { name.value = e.target.value },
})

// With CSS classes
h('div', { class: 'wui-card wui-card--active' },
  h('h2', null, 'Title'),
  h('p', null, 'Content'),
)

// Boolean attributes
h('input', { type: 'checkbox', checked: true })

// Events
h('button', { onclick: () => save() }, 'Save')
h('input', { oninput: (e) => handleInput(e) })
h('form', { onsubmit: (e) => { e.preventDefault(); submit() } })
```

### Reactive bindings

Pass a `ref()` or `computed()` as an attribute value:

```ts
const name = ref('')
h('input', { value: name })           // value stays in sync
h('span', null, name)                 // text content updates
h('input', { disabled: isDisabled })  // boolean attribute toggles
```

## ref() / computed() / effect()

```ts
import { ref, computed, effect } from '@weifuwujs/ui'

const name = ref('World')
const greeting = computed(() => `Hello ${name.value}!`)

effect(() => {
  console.log(greeting.value)  // logs whenever name changes
})

name.value = 'weifuwu'  // triggers effect and any bound DOM
```

## bind() — Form binding

```ts
import { bind } from '@weifuwujs/ui'

const name = ref('')
const agreed = ref(false)
const age = ref(0)

// Text input
h('input', bind(name))

// Checkbox
h('input', { type: 'checkbox', ...bind(agreed) })

// Number input
h('input', { type: 'number', ...bind(age, { number: true }) })

// Textarea
h('textarea', bind(message))
```

## render() / reactiveRender()

```ts
import { render, reactiveRender } from '@weifuwujs/ui'

// One-shot render
render(document.getElementById('root'), () =>
  h('h1', null, 'Hello')
)

// Reactive render (updates when signals change)
const count = ref(0)
reactiveRender(document.getElementById('root'), () =>
  h('button', { onclick: () => count.value++ }, count)
)
```

## Error Boundary

```ts
import { errorBoundary, reactiveRender } from '@weifuwujs/ui'

reactiveRender(container, () =>
  errorBoundary(
    () => MyComponent(),
    (err) => h('p', { class: 'wui-alert wui-alert--danger' }, err.message)
  )
)
```

## Lifecycle (onmount)

```ts
h('div', {
  onmount: (el) => {
    // el is now in the DOM
    initChart(el, data)
  }
})
```

## Stores (server data bridge)

```js
weifuwu.theme         // { value, toggle(), set() }
weifuwu.i18n          // { locale, t(key), set(locale) }
weifuwu.toast         // { show(msg, type), success(), error() }
weifuwu.modal         // { open, show(id), hide() }
```

## CSS components

```html
<button class="wui-btn wui-btn--primary">Primary</button>
<div class="wui-card"><div class="wui-card__header">Title</div></div>
<span class="wui-badge wui-badge--success">Active</span>
<div class="wui-alert wui-alert--info">Info</div>
<table class="wui-table">...</table>
```

### Available components

- `.wui-btn` — buttons with `--primary`, `--success`, `--danger`, `--ghost`, `--sm`, `--lg`
- `.wui-card` — card with `__header` and `__footer`
- `.wui-input`, `.wui-select`, `.wui-textarea`, `.wui-label`, `.wui-checkbox` — form controls
- `.wui-badge` — badges with `--success`, `--warning`, `--danger`, `--info`
- `.wui-alert` — alerts with same variants
- `.wui-toast` / `.wui-toast-container` — toast notifications
- `.wui-modal-overlay` / `.wui-modal-body` — modal dialogs
- `.wui-nav` / `.wui-nav-item` — navigation
- `.wui-table` — data tables
- `.wui-tabs` / `.wui-tab` — tab navigation
- `.wui-dropdown` / `.wui-dropdown-menu` — dropdowns
- `.wui-spinner` — loading indicator

All components support `[data-theme="dark"]` automatically.

## Scaffold a project

```bash
npx create-weifuwu my-app --ui
cd my-app
npm run dev
```

## License

MIT
