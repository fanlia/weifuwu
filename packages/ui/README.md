# @weifuwu/ui

**Client-side runtime + CSS components for weifuwu** — `ref()`, `html()`, `render()`.

Extends `html()` from server to browser with reactive state management and UI components.
Same `html()` API on both sides — no JSX, no VDOM, no build step.

```
npm install @weifuwu/ui
```

## Usage

### Server

```ts
import { weifuwuiAssets } from '@weifuwu/ui'

app.use('/_ui', weifuwuiAssets())
// Serves:
//   /_ui/weifuwu-ui.css  — CSS components
//   /_ui/weifuwu-ui.js   — Client runtime
```

### Browser

```html
<!DOCTYPE html>
<html data-theme="${ctx.theme.value}">
  <head>
    <link rel="stylesheet" href="/_ui/weifuwu-ui.css" />
    <script defer src="/_ui/weifuwu-ui.js"></script>
    <script id="__wui-data" type="application/json">
      {"theme": "light", "locale": "en", "messages": {}}
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const { ref, html, render } = weifuwu

      const count = ref(0)
      render(document.getElementById('app'), () => html`
        <button class="wui-btn wui-btn--primary"
                @click="${() => count.value++}">
          Count: ${count.value}
        </button>
      `)
    </script>
  </body>
</html>
```

## API

| Function | Purpose |
|---|---|
| `ref(initial)` | Reactive state container |
| `computed(fn)` | Derived reactive value |
| `effect(fn)` | Auto-tracking side effect |
| `html\`\`` | Tagged template → live DOM (same API as server) |
| `render(el, fn)` | Mount reactive template |

### Event bindings

```js
html`<button @click="${handler}">Click</button>`
html`<input @input="${(e) => ...}" />`
html`<div @keydown="${(e) => ...}"></div>`
```

### Attribute bindings

```js
html`<input :value="${signal}" />`     // one-way bind
html`<input ?checked="${signal}" />`    // boolean attribute
```

### Stores (server data bridge)

```js
weifuwu.theme         // { value, resolved, toggle(), set() }
weifuwu.i18n          // { locale, messages, t(key), set(locale) }
weifuwu.toast         // { show(msg, type), success(), error(), dismiss() }
weifuwu.modal         // { open, show(id), hide() }
```

## CSS components

```html
<button class="wui-btn wui-btn--primary">Primary</button>
<button class="wui-btn wui-btn--danger wui-btn--sm">Small Danger</button>

<div class="wui-card">
  <div class="wui-card__header">Title</div>
  <p>Content</p>
</div>

<span class="wui-badge wui-badge--success">Active</span>

<div class="wui-alert wui-alert--info">Info message</div>

<table class="wui-table">...</table>

<div class="wui-tabs">
  <button class="wui-tab wui-tab--active">Tab 1</button>
  <button class="wui-tab">Tab 2</button>
</div>
```

## License

MIT
