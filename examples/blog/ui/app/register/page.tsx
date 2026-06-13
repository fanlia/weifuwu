import { useFlashMessage, useLocale, useTheme } from '../../../../../react.ts'

export default function RegisterPage() {
  const { locale, setLocale, t } = useLocale()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const flash = useFlashMessage<{ type: string; text: string }>()

  return (
    <>
      <header className="border-b dark:border-gray-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14 px-4">
          <a href="/" className="font-bold text-lg hover:text-blue-600 transition">weifuwu Blog</a>
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
              className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              {resolvedTheme === 'light' ? '🌙' : '☀️'} {theme === 'dark' ? t('theme.dark') : t('theme.light')}
            </button>
            <button onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              {locale === 'en' ? t('locale.zh') : t('locale.en')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold mb-6 text-center">{t('auth.register')}</h1>

        {flash && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            flash.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {flash.text}
          </div>
        )}

        <form action="/register" method="POST" className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.name')}</label>
            <input name="name" required
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
            <input name="email" type="email" required
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
            <input name="password" type="password" required minLength={6}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition" />
          </div>
          <button type="submit"
            className="w-full px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            {t('auth.register')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {t('auth.hasAccount')}{' '}
          <a href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
            {t('auth.login')}
          </a>
        </p>
      </main>

      <footer className="border-t dark:border-gray-800 py-8 text-center text-sm text-gray-500 mt-12">
        {t('footer.text')}
      </footer>
    </>
  )
}
