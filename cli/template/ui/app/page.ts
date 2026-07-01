import { html } from 'weifuwu'

export default function(ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  const theme = ctx.theme?.value || 'system'
  const locale = ctx.i18n?.locale || 'en'

  return html`<div x-data="{ open: false }" class="min-h-screen">
    <!-- Navbar -->
    <nav class="border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
        <span class="font-bold text-lg">weifuwu</span>
        <div class="flex items-center gap-3 text-sm">
          <!-- Locale toggle -->
          <a href="/__lang/${locale === 'en' ? 'zh-CN' : 'en'}"
             class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                    hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            ${locale === 'en' ? '中文' : 'EN'}
          </a>
          <!-- Theme toggle -->
          <a href="/__theme/${theme === 'dark' ? 'light' : 'dark'}"
             class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                    hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            ${theme === 'dark' ? '☀️' : '🌙'}
          </a>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section class="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 class="text-4xl font-bold tracking-tight mb-3">${t('title')}</h1>
      <p class="text-gray-500 dark:text-gray-400 text-lg mb-8">
        Pure Node.js, no build step
      </p>

      <div class="flex justify-center gap-3">
        <button @click="open = !open"
                class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white
                       hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300">
          ${t('cta')}
        </button>
        <a href="/docs"
           class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium
                  hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800">
          ${t('docs')}
        </a>
      </div>

      <!-- Alpine demo: click to reveal -->
      <div x-show="open" x-cloak
           class="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-left">
        ${t('demo')}
      </div>
    </section>
  </div>`
}
