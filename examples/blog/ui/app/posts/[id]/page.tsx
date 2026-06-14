import { useLoaderData, useLocale, useTheme } from '../../../../../react.ts'

interface Post {
  id: number
  title: string
  content: string
  created_at: string
}

export default function PostPage() {
  const { locale, setLocale, t } = useLocale()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const { post } = useLoaderData<{ post: Post | null }>()

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">{t('post.notFound')}</h1>
        <a href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          {t('post.back')}
        </a>
      </div>
    )
  }

  return (
    <>
      {/* Navbar */}
      <header className="border-b dark:border-gray-800">
        <div className="max-w-3xl mx-auto flex items-center justify-between h-14 px-4">
          <a href="/" className="font-bold text-lg hover:text-blue-600 transition">
            weifuwu Blog
          </a>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
              className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {resolvedTheme === 'light' ? '🌙' : '☀️'}{' '}
              {theme === 'dark' ? t('theme.dark') : t('theme.light')}
            </button>
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {locale === 'en' ? t('locale.zh') : t('locale.en')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 inline-block"
        >
          {t('post.back')}
        </a>

        <article>
          <h1 className="text-3xl font-bold mb-3">{post.title}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-8">
            {t('post.createdAt')} {new Date(post.created_at).toLocaleDateString()}
          </p>
          <div className="prose dark:prose-invert max-w-none leading-relaxed whitespace-pre-wrap">
            {post.content}
          </div>
        </article>
      </main>

      <footer className="border-t dark:border-gray-800 py-8 text-center text-sm text-gray-500 mt-12">
        {t('footer.text')}
      </footer>
    </>
  )
}
