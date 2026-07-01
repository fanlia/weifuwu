# create-weifuwu

**Scaffold a new weifuwu project** — API-only or React SSR.

```
npm create weifuwu@latest my-app
```

Or using npx:

```
npx create-weifuwu my-app
```

## Usage

### API-only project

```bash
npm create weifuwu my-api
cd my-api
npm run dev
```

Creates a minimal project with `app.ts` and `index.ts`.

### React SSR project

```bash
npm create weifuwu my-app --ssr
cd my-app
npm run dev
```

Creates a full React SSR project with filesystem routing, Tailwind v4, and i18n.

### Options

| Flag | Description |
|---|---|
| `--ssr` / `--react` | Generate React SSR project |
| `--skip-install` | Skip `npm install` |

### Other commands

```bash
npx create-weifuwu version     # Print CLI version
```

## Scaffolded structure

### API-only

```
my-api/
├── app.ts          # Route definitions
├── index.ts        # Server entry
├── .env            # Environment variables
├── .gitignore
├── package.json
└── tsconfig.json
```

### React SSR

```
my-app/
├── index.ts            # Server entry
├── app.ts              # App setup
├── ui/
│   ├── app/
│   │   ├── layout.tsx  # Root layout
│   │   ├── page.tsx    # Home page
│   │   ├── globals.css # Global styles
│   │   └── about/
│   │       └── page.tsx
│   └── ...
├── locales/
│   ├── en.json
│   └── zh-CN.json
├── .env
├── .gitignore
├── package.json
└── tsconfig.json
```

## License

MIT
