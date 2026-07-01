# weifuwu-ui — Theme, i18n, Flash, Toast

weifuwu-ui is an **Alpine.js plugin** that provides Alpine stores for theme switching, internationalization, flash messages, and toast notifications. It ships with weifuwu and is served via `wfuwAssets()`.

## Setup

In your layout:

```html
<script src="/__wfw/js/htmx.min.js"></script>
<script defer src="/__wfw/js/alpine.min.js"></script>
<script src="/__wfw/js/weifuwu-ui.js"></script>
<link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
```

With cache-busting:

```ts
import { wfuwVersion } from 'weifuwu'

html`
  <script src="/__wfw/js/htmx.min.js?v=${wfuwVersion}"></script>
  <script defer src="/__wfw/js/alpine.min.js?v=${wfuwVersion}"></script>
  <script src="/__wfw/js/weifuwu-ui.js?v=${wfuwVersion}"></script>
`
```

## Alpine Stores

### `$store.theme`

```html
<button data-wf-theme="dark" @click="$store.theme.toggle()"
        x-text="$store.theme.value === 'dark' ? '☀️' : '🌙'"></button>
```

- `$store.theme.value` — `'dark' | 'light' | 'system'`
- `$store.theme.toggle()` — toggle between dark/light, syncs cookie + server

### `$store.i18n`

```html
<button data-wf-lang="zh-CN" @click="
  $store.i18n.switch($store.i18n.locale === 'zh-CN' ? 'en' : 'zh-CN')
">中文</button>

<h1 x-text="$store.i18n.t('title')">Fallback title</h1>
```

- `$store.i18n.locale` — current locale
- `$store.i18n.t(key)` — translate a key (supports dot path: `'nav.title'`)
- `$store.i18n.switch(locale)` — switch locale, fetches messages from server

The i18n messages are injected via a `<script id="__wf-i18n" type="application/json">` tag.

### `$store.flash`

```html
<div x-show="$store.flash.show" x-transition
     class="wu-toast wu-toast-info"
     x-text="$store.flash.message"
     @click="$store.flash.clear()"></div>
```

- `$store.flash.show` — boolean
- `$store.flash.message` — flash text
- `$store.flash.clear()` — dismiss

Flash data is injected via a `<script id="__wf-flash" type="application/json">` tag.

### `$toast()`

```html
<button @click="$toast('Saved!', 'success')">Save</button>
```

Arguments: `(message: string, type?: 'info' | 'success' | 'error')`

## HTMX + Alpine Pattern

For AJAX loading, form submission, SSE, and WebSocket, use HTMX attributes:

```html
<!-- AJAX load -->
<div hx-get="/api/users" hx-trigger="load" hx-swap="innerHTML"></div>

<!-- Form submit -->
<form hx-post="/api/contact" hx-target="#result">
  <input name="email" />
  <button type="submit">Send</button>
</form>

<!-- SSE -->
<div hx-sse="connect:/events" hx-trigger="sse:message" hx-swap="beforeend"></div>
```

For state, DOM binding, and UI components, use Alpine.js:

```html
<div x-data="{ open: false }">
  <button @click="open = !open">Toggle</button>
  <div x-show="open" x-transition>Content</div>
</div>
```

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.wu-btn` | Base button |
| `.wu-btn-primary` | Primary button |
| `.wu-btn-sm` | Small button |
| `.wu-input` | Text input |
| `.wu-card` | Card container |
| `.wu-modal` | Modal overlay |
| `.wu-modal-content` | Modal content |
| `.wu-modal-close` | Modal close button |
| `.wu-toast` | Toast notification |
| `.wu-toast-info` | Info toast |
| `.wu-toast-success` | Success toast |
| `.wu-toast-error` | Error toast |
| `.wu-flex` | Flexbox container |
| `.wu-gap-sm` / `.wu-gap-md` | Flex gap |
| `.wu-p-4` | Padding |
| `.wu-text-lg` / `.wu-text-2xl` | Font sizes |
| `.wu-text-secondary` | Muted text |
| `.wu-border-bottom` | Border |
