import { createElement, type ReactNode } from 'react'

export function Head({ children }: { children: ReactNode }) {
  return createElement('template', { id: '__wfw_head' }, children)
}
