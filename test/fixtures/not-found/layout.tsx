import { createElement } from 'react'

export default function Layout({ children }: { children: any }) {
  return createElement('html', { lang: 'en' },
    createElement('head', null,
      createElement('meta', { charSet: 'utf-8' }),
      createElement('title', null, 'Layout'),
    ),
    createElement('body', null,
      createElement('header', null, 'Layout-Header'),
      children,
    ),
  )
}
