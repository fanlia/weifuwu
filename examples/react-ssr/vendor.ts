// Re-export react and react-dom/client for vendor bundle
export {
  createElement,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  useContext,
  createContext,
  Component,
  Fragment,
} from 'react'
export { jsx, jsxs } from 'react/jsx-runtime'
export { hydrateRoot, createRoot } from 'react-dom/client'
