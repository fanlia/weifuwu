# weifuwu Project

## SSR UI Development

This project uses weifuwu-ui.js — a zero-dependency frontend runtime (~5KB).

**Must read**: `node_modules/weifuwu/README.md` for the full framework reference.

For weifuwu-ui.js attribute reference and component docs, see:
`node_modules/weifuwu/dist/docs/ssr/ui.md`

### Key attributes

| Attribute                                              | Purpose                       |
| ------------------------------------------------------ | ----------------------------- |
| `wu-data`                                              | Local reactive state          |
| `wu-text`                                              | Bind state → textContent      |
| `wu-show` / `wu-hide`                                  | Visibility toggle             |
| `wu-class`                                             | Conditional CSS class         |
| `wu-model`                                             | Two-way input binding         |
| `wu-on`                                                | Event handler (`click: expr`) |
| `wu-get` / `wu-post` / `wu-put` / `wu-delete`          | AJAX requests                 |
| `wu-target` / `wu-swap`                                | Content replacement           |
| `wu-theme`                                             | Theme switching               |
| `wu-lang` / `wu-text-key`                              | i18n switching                |
| `wu-flash`                                             | Flash messages                |
| `wu-modal` / `wu-collapse` / `wu-tabs` / `wu-dropdown` | UI components                 |
| `wu.toast()`                                           | Toast notifications           |
