import { createContext, useContext } from 'react'

export const TsxContext = createContext<{
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed?: Record<string, unknown>
}>({ params: {}, query: {} })

export function useTsx() {
  return useContext(TsxContext)
}
