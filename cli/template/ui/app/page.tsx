import { useState } from 'react'
import { useWebsocket, useLoaderData, useLocale, useTheme } from '../../../../react.ts'
import Greeting from '../components/Greeting.tsx'

export default function Home() {
  const [input, setInput] = useState('')
  const { send, lastMessage, readyState } = useWebsocket('/ws/echo')
  const { locale, t, setLocale } = useLocale()
  const { resolvedTheme, setTheme } = useTheme()
  const ld = useLoaderData<{ features?: { title: string; desc: string }[] }>()

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <header className="border-b dark:border-gray-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
          <span className="font-bold text-lg">weifuwu</span>
          <nav className="hidden sm:flex gap-6 text-sm">
            <span className="hover:text-blue-600 transition cursor-pointer">{t('nav.home')}</span>
            <span className="hover:text-blue-600 transition cursor-pointer">{t('nav.docs')}</span>
            <span className="hover:text-blue-600 transition cursor-pointer">{t('nav.api')}</span>
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
              className="px-2 py-1 rounded border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {locale === 'en' ? '中文' : 'EN'}
            </button>
            <button
              onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
              className="px-2 py-1 rounded border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {resolvedTheme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="text-center py-20 px-4">
        <h1 className="text-5xl font-bold mb-4">{t('hero.title')}</h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-8">{t('hero.subtitle')}</p>
        <Greeting name="Weifuwu" />
        <div className="flex justify-center gap-4 mt-8">
          <a
            href="#"
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            {t('cta.start')}
          </a>
          <a
            href="#"
            className="px-6 py-2.5 border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition font-medium"
          >
            {t('cta.learn')}
          </a>
        </div>
      </section>

      {/* Features */}
      {ld.features && (
        <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-4 pb-20">
          {ld.features.map((f, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
            >
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
            </div>
          ))}
        </section>
      )}

      {/* WebSocket demo */}
      <section className="max-w-xl mx-auto px-4 pb-20">
        <div className="border dark:border-gray-800 rounded-xl p-6 bg-gray-50 dark:bg-gray-900 space-y-4">
          <h2 className="font-semibold">{t('demo.title')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {readyState === 1
              ? t('ws.connected')
              : readyState === 0
                ? t('ws.connecting')
                : t('ws.disconnected')}
          </p>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  send(input)
                  setInput('')
                }
              }}
              placeholder={t('demo.placeholder')}
              className="flex-1 border dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-950 outline-none focus:border-blue-500 transition"
            />
            <button
              onClick={() => {
                send(input)
                setInput('')
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition font-medium"
            >
              {t('demo.send')}
            </button>
          </div>
          {lastMessage && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{t('demo.echo')}:</span> {lastMessage}
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t dark:border-gray-800 py-8 text-center text-sm text-gray-500">
        © 2026 MyApp · {t('footer.privacy')} · {t('footer.terms')}
      </footer>
    </div>
  )
}
