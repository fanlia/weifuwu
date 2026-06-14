# weifuwu Blog Example

A full-featured blog application demonstrating SSR, PostgreSQL, i18n, theme switching, and flash messages.

## Quick Start

```bash
# Start PostgreSQL
docker compose up -d

# Run database migration
node migrate.ts

# Start dev server
npx tsx app.ts
```

## What's shown

| Feature          | How                                               |
| ---------------- | ------------------------------------------------- |
| SSR with layouts | `ui/app/layout.tsx` wraps all pages               |
| DB-driven pages  | Homepage fetches posts from PostgreSQL            |
| Dynamic routes   | `ui/app/posts/[id]/page.tsx`                      |
| i18n             | Locale switcher with `useLocale()`                |
| Theme            | Light/dark toggle with `useTheme()`               |
| Flash messages   | Post creation shows success/error via `flash()`   |
| Tailwind CSS     | Utility-first styling with dark mode              |
| loaderData       | Server-side data passed to client via SSR context |
