import { createElement } from 'react'

export function buildHtmlShell(title: string, bodyElement: any, layoutComponents: any[]): any {
  if (layoutComponents.length === 0) {
    return createElement(
      'html',
      { lang: 'en' },
      createElement(
        'head',
        null,
        createElement('meta', { charSet: 'utf-8' }),
        createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        createElement('title', null, title),
      ),
      createElement('body', null, bodyElement),
    )
  }
  let element = bodyElement
  for (const L of layoutComponents.toReversed()) {
    element = createElement(L, { children: element })
  }
  return element
}
