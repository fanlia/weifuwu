# weifuwu-ui — Frontend Runtime for SSR

`weifuwu-ui` is a zero-dependency frontend runtime that ships with weifuwu.
It provides AJAX loading, state binding, SSE streaming, WebSocket, theme/i18n/flash integration,
and UI components — all via HTML attributes. No build step, no npm install.

## Quick Start

```html
<script src="/__wfw/js/weifuwu-ui.js"></script>
<link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css" />
```

In weifuwu:

```ts
import { Router, wfuwAssets } from 'weifuwu'

const app = new Router()
app.use('/', wfuwAssets()) // serves /__wfw/js/weifuwu-ui.js and /__wfw/css/weifuwu-ui.css
```

Then in your `html()` layout:

```ts
html`
  <!DOCTYPE html>
  <html data-theme="${ctx.theme?.value || 'light'}">
    <head>
      <script src="/__wfw/js/weifuwu-ui.js"></script>
      <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css" />
    </head>
    <body>
      <button class="wu-btn wu-btn-primary">Hello</button>
    </body>
  </html>
`
```

---

## Attribute Reference

### 1. State & Binding (`wu-data`)

```html
<div wu-data='{"count":0,"open":false,"name":"World"}'>
  <button class="wu-btn" wu-on="click: count++">+1</button>
  <span wu-text="count">0</span>

  <button class="wu-btn" wu-on="click: open = !open">Toggle</button>
  <div wu-show="open">This is visible when open is true</div>
  <div wu-hide="open">This is hidden when open is true</div>

  <input wu-model="name" />
  <p>Hello, <span wu-text="name"></span>!</p>
</div>
```

| Attribute  | Description                                                                            |
| ---------- | -------------------------------------------------------------------------------------- |
| `wu-data`  | Define local reactive state (JSON object).                                             |
| `wu-text`  | Bind state value to element's `textContent`.                                           |
| `wu-html`  | Bind state value to element's `innerHTML` (escaped).                                   |
| `wu-show`  | Show element when state value is truthy (`display: ''`).                               |
| `wu-hide`  | Hide element when state value is truthy (`display: none`).                             |
| `wu-class` | Conditional CSS class from expression: `wu-class="count > 0 ? 'has-items' : 'empty'"`. |
| `wu-model` | Two-way binding on `<input>`, `<select>`, `<textarea>`.                                |
| `wu-each`  | Iterate over an array. Template uses `${this}` (item) and `${index}` (index).          |

### 2. Events (`wu-on`)

```html
<button wu-on="click: count++">Increment</button>
<input wu-on="keyup: if(event.key === 'Enter') search()" />
```

| Format        | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `click: expr` | Execute expression on click.                                   |
| `keyup: expr` | Execute expression on keyup. Expression has access to `event`. |

Expressions execute in the scope of `wu-data` state variables. Any mutation goes through the Proxy and triggers binding updates.

### 3. AJAX Loading

```html
<!-- Load content on page load -->
<div wu-get="/partials/posts" wu-trigger="load">
  <div class="wu-skeleton" style="height: 100px"></div>
</div>

<!-- Click to load -->
<button class="wu-btn" wu-get="/users/1/edit" wu-target="#main">Edit</button>

<!-- POST form -->
<form wu-post="/users" wu-target="#user-list">
  <input name="name" class="wu-input" />
  <button class="wu-btn wu-btn-primary">Create</button>
</form>

<!-- DELETE with confirmation -->
<button
  class="wu-btn wu-btn-danger"
  wu-delete="/users/1"
  wu-target="#user-1"
  wu-confirm="Delete this user?"
>
  Delete
</button>

<!-- Polling -->
<div wu-get="/notifications" wu-trigger="every:5s" wu-target="#notif-list"></div>

<!-- Infinite scroll -->
<div wu-get="/posts?page=2" wu-trigger="visible" wu-target="#posts" wu-swap="append"></div>

<!-- With loading indicator -->
<button class="wu-btn" wu-get="/slow" wu-target="#result" wu-loading="#spinner">Load</button>
<div id="spinner" class="wu-hidden">Loading...</div>
```

| Attribute                                                  | Description                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `wu-get` / `wu-post` / `wu-put` / `wu-patch` / `wu-delete` | HTTP method + URL                                                                    |
| `wu-trigger`                                               | `load` \| `click` \| `every:Ns` \| `visible`                                         |
| `wu-target`                                                | CSS selector for target element                                                      |
| `wu-swap`                                                  | `innerHTML` (default) \| `outerHTML` \| `before` \| `after` \| `prepend` \| `append` |
| `wu-confirm`                                               | Confirmation dialog text                                                             |
| `wu-loading`                                               | CSS selector for loading indicator (auto toggle `wu-hidden`)                         |

**Server response conventions:**

- Success (2xx): replace target with returned HTML
- Error (422) with `{ errors: { field: "msg" } }`: fill `[wu-error="field"]` elements
- `X-WFU-Redirect` header: client-side redirect

### 4. SSE Streaming

```html
<!-- Auto-connect SSE endpoint -->
<div wu-sse="/api/metrics" wu-on-sse-metric="cpu = data.cpu; memory = data.memory">
  CPU: <span wu-text="cpu">0</span>% Memory: <span wu-text="memory">0</span>%
</div>

<!-- Stream from POST response (AI chat, etc.) -->
<button
  class="wu-btn wu-btn-primary"
  wu-post="/api/chat"
  wu-stream
  wu-on-sse-text-delta="output += data.text"
  wu-on-sse-finish="loading = false"
>
  Send
</button>
<pre wu-text="output"></pre>
```

**`wu-stream`**: makes a POST/GET request and treats the response as SSE stream.
**`wu-sse`**: establishes a persistent EventSource connection.
**`wu-on-sse-{eventName}`**: handles SSE events by name. `data` variable holds the JSON-parsed event data.

**Programmatic API:**

```js
// In inline <script> or wu-on expressions
wu.stream('POST', '/api/chat', {
  body: JSON.stringify({ message: 'Hello' }),
  onEvent: {
    'text-delta': (data) => {
      console.log(data.text)
    },
    finish: () => {
      console.log('Done')
    },
  },
  onDone: () => {
    console.log('Stream closed')
  },
})
wu.abort() // Cancel active stream
```

### 5. WebSocket

```html
<div
  wu-ws="wss://server.com/chat"
  wu-on-ws-open="connected = true"
  wu-on-ws-close="connected = false"
  wu-on-ws-message="messages.push(JSON.parse(data))"
>
  Status: <span wu-text="connected ? 'Connected' : 'Disconnected'"></span>
</div>
```

| Attribute          | Description                                       |
| ------------------ | ------------------------------------------------- |
| `wu-ws`            | WebSocket URL (auto-connect on page load)         |
| `wu-on-ws-open`    | Called when connection opens                      |
| `wu-on-ws-close`   | Called when connection closes                     |
| `wu-on-ws-message` | Called on each message. `data` is the raw string. |

**Programmatic API:**

```js
wu.send({ message: 'Hello' }) // Send JSON through all active WS connections
```

### 6. Theme Switching

```html
<html data-theme="light">
  <body>
    <button wu-theme="dark">🌙 Dark</button>
    <button wu-theme="light">☀️ Light</button>
    <button wu-theme="system">🖥 System</button>
  </body>
</html>
```

The `data-theme` attribute on `<html>` controls all CSS variables.

- `system` follows the OS preference (`prefers-color-scheme`).
- Changes are persisted via cookie and synced with server.
- CSS variables in `:root` and `[data-theme="dark"]` control all component colors.

### 7. Internationalization

```html
<body data-locale="zh-CN">
  <button wu-lang="zh-CN">中文</button>
  <button wu-lang="en">English</button>

  <span wu-text-key="greeting">你好</span>
  <span wu-text-key="nav.home">首页</span>
</body>
```

**Server setup:**

```ts
// In your layout, inject translation messages
html`
  <script id="__wfw-i18n" type="application/json">
    ${raw(JSON.stringify(ctx.i18n.messages))}
  </script>
`
```

- `wu-lang`: click to switch locale. Sends JSON request to `/__lang/:locale`, updates all `[wu-text-key]` elements.
- `wu-text-key`: language key bound element. Server renders initial value. On switch, weifuwu-ui updates text without refresh.
- `wu.t(key)`: programmatic translation access (useful in scripts).

### 8. Flash Messages

```html
<div wu-flash></div>
```

**Server setup:**

```ts
// In your page
html`
  ${ctx.flash.value &&
  html`
    <script id="__wfw-flash" type="application/json">
      ${raw(JSON.stringify(ctx.flash.value))}
    </script>
  `}
  <div wu-flash></div>
`
```

| Flash data format                         | Result                       |
| ----------------------------------------- | ---------------------------- |
| `{ type: "success", message: "Saved!" }`  | Green flash, auto-dismiss 3s |
| `{ type: "error", message: "Failed" }`    | Red flash                    |
| `{ type: "info", message: "Processing" }` | Blue flash                   |

### 9. Form Validation Errors

```html
<form wu-post="/users" wu-target="#user-list">
  <label class="wu-label">Name</label>
  <input name="name" class="wu-input" />
  <span wu-error="name" class="wu-error"></span>

  <button class="wu-btn wu-btn-primary">Submit</button>
</form>
```

Server returns 422 with JSON body `{ errors: { name: "Required", email: "Invalid" } }`.
weifuwu-ui automatically fills the corresponding `[wu-error="field"]` elements.

---

## UI Components

### Modal

```html
<button class="wu-btn" wu-target="#my-modal" wu-toggle>Open Modal</button>

<div id="my-modal" wu-modal>
  <div class="wu-modal-content">
    <h3 class="wu-modal-title">Title</h3>
    <p>Modal content here...</p>
    <button class="wu-btn" wu-close>Close</button>
  </div>
</div>
```

Features: ESC to close, click outside to close, `wu-toggle` / `wu-close` attributes.

### Collapse

```html
<div wu-collapse>
  <button wu-toggle>Section Title</button>
  <div wu-body>Collapsible content here.</div>
</div>
```

### Tabs

```html
<div wu-tabs>
  <nav>
    <button wu-tab="tab1" class="wu-active">Tab 1</button>
    <button wu-tab="tab2">Tab 2</button>
  </nav>
  <div wu-panel="tab1" class="wu-active">Content 1</div>
  <div wu-panel="tab2">Content 2</div>
</div>
```

### Dropdown

```html
<div wu-dropdown>
  <button wu-toggle class="wu-btn">Menu ▾</button>
  <div wu-menu>
    <a href="/profile">Profile</a>
    <a href="/settings">Settings</a>
    <hr />
    <a href="/logout">Logout</a>
  </div>
</div>
```

### Toast Notification

```js
// Programmatic
wu.toast('Saved successfully!', 'success')
wu.toast('Something went wrong', 'error')
wu.toast('New message received', 'info')
wu.toast('Warning: disk space low', 'warning')
```

---

## CSS Customization

Override CSS variables in your stylesheet:

```css
:root {
  --wu-primary: #7c3aed; /* Change primary color to purple */
  --wu-radius: 8px; /* Larger border radius */
  --wu-bg: #faf5ff; /* Custom background */
  --wu-text: #1a1a2e; /* Custom text color */
}
```

The theme is controlled by `data-theme` on `<html>`:

```html
<html data-theme="dark">
  <!-- Dark mode active -->
  <html data-theme="light">
    <!-- Light mode active -->
  </html>
</html>
```

---

## CSS Class Reference

| Class                                                         | Description                |
| ------------------------------------------------------------- | -------------------------- |
| `.wu-btn`                                                     | Base button                |
| `.wu-btn-primary`                                             | Primary action button      |
| `.wu-btn-danger`                                              | Destructive button         |
| `.wu-btn-sm` / `.wu-btn-lg`                                   | Button sizes               |
| `.wu-input` / `.wu-select` / `.wu-textarea`                   | Form inputs                |
| `.wu-label`                                                   | Form label                 |
| `.wu-error`                                                   | Error text                 |
| `.wu-card`                                                    | Card container             |
| `.wu-modal-content`                                           | Modal content              |
| `.wu-toast` / `.wu-toast-success` / `.wu-toast-error`         | Toast styles               |
| `.wu-skeleton`                                                | Loading skeleton animation |
| `.wu-flash-*`                                                 | Flash message styles       |
| `.wu-hidden`                                                  | Utility: `display: none`   |
| `.wu-flex` / `.wu-grid` / `.wu-gap-*` / `.wu-p-*` / `.wu-m-*` | Layout utilities           |

---

## Integration with weifuwu Backend

| Backend Module | Frontend Attribute                   |
| -------------- | ------------------------------------ |
| `theme()`      | `wu-theme`                           |
| `i18n()`       | `wu-lang` / `wu-text-key` / `wu.t()` |
| `flash()`      | `wu-flash`                           |

### Full Example

```ts
import { Router, html, raw, theme, i18n, flash, wfuwAssets } from 'weifuwu'

const app = new Router()
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(flash())
app.use('/', wfuwAssets())

app.get(
  '/',
  (req, ctx) => html`
    <!DOCTYPE html>
    <html data-theme="${ctx.theme.value}">
      <head>
        <meta charset="utf-8" />
        <title>${ctx.i18n.t('app.title')}</title>
        <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css" />
        <script src="/__wfw/js/weifuwu-ui.js"></script>
        <script id="__wfw-i18n" type="application/json">
          ${raw(JSON.stringify(ctx.i18n.messages))}
        </script>
        ${ctx.flash.value &&
        raw(
          `<script id="__wfw-flash" type="application/json">${JSON.stringify(ctx.flash.value)}</script>`,
        )}
      </head>
      <body data-locale="${ctx.i18n.locale}">
        <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
          <strong>My App</strong>
          <div class="wu-flex wu-gap-sm">
            <button wu-theme="dark">🌙</button>
            <button wu-theme="light">☀️</button>
            <button wu-lang="zh-CN">中文</button>
            <button wu-lang="en">EN</button>
          </div>
        </nav>

        <div wu-flash></div>

        <main class="wu-p-4">
          <h1 class="wu-text-2xl">${ctx.i18n.t('dashboard.title')}</h1>
          <div wu-get="/partials/stats" wu-trigger="load" class="wu-mt-4">
            <div class="wu-skeleton" style="height:100px"></div>
          </div>
        </main>
      </body>
    </html>
  `,
)
```
