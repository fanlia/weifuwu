import { useFlashMessage, useLoaderData, useLocale, useTheme } from '../../../../react.ts'

interface Post {
  id: number
  title: string
  excerpt: string
  created_at: string
  author_name: string | null
}

interface CurrentUser {
  id: number
  email: string
  name: string
}

export default function HomePage() {
  const { locale, setLocale, t } = useLocale()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { posts, currentUser } = useLoaderData<{ posts: Post[]; currentUser: CurrentUser | null }>()
  const flash = useFlashMessage<{ type: string; text: string }>()

  return (
    <>
      {/* Navbar */}
      <header className="border-b dark:border-gray-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14 px-4">
          <a href="/" className="font-bold text-lg hover:text-blue-600 transition">
            weifuwu Blog
          </a>
          <div className="flex items-center gap-3 text-sm">
            {currentUser ? (
              <>
                <span className="text-gray-500 dark:text-gray-400">{currentUser.name}</span>
                <a
                  href="/logout"
                  className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {t('auth.logout')}
                </a>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  className="px-3 py-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {t('auth.login')}
                </a>
                <a
                  href="/register"
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  {t('auth.register')}
                </a>
              </>
            )}
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Flash message */}
        {flash && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
              flash.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}
          >
            {flash.text}
          </div>
        )}

        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-4xl font-bold mb-2">{t('hero.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{t('hero.subtitle')}</p>
        </section>

        {/* Create Post Form — only for logged-in users */}
        {currentUser && (
          <section className="mb-12 p-6 rounded-xl border dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <h2 className="text-lg font-semibold mb-4">{t('create.title')}</h2>
            <form action="/posts/create" method="POST" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('create.form.title')}</label>
                <input
                  name="title"
                  required
                  placeholder={t('create.form.titlePlaceholder')}
                  className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('create.form.content')}</label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  placeholder={t('create.form.contentPlaceholder')}
                  className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition resize-y"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
              >
                {t('create.submit')}
              </button>
            </form>
          </section>
        )}

        {/* Post List */}
        <section>
          <h2 className="text-xl font-semibold mb-4">{t('posts.title')}</h2>
          {posts.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t('posts.empty')}</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="p-5 rounded-xl border dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition bg-white dark:bg-gray-900"
                >
                  <h3 className="font-semibold text-lg mb-1">{post.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                    {post.excerpt}...
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 dark:text-gray-500">
                      {post.author_name && `${t('post.by')} ${post.author_name} · `}
                      {t('post.createdAt')} {new Date(post.created_at).toLocaleDateString()}
                    </span>
                    <a
                      href={`/posts/${post.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {t('posts.readMore')}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t dark:border-gray-800 py-8 text-center text-sm text-gray-500 mt-12">
        {t('footer.text')}
      </footer>
    </>
  )
}
