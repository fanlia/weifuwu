// JSX type declarations for weifuwu/client JSX runtime
// The runtime handles Signal values natively — these types reflect that

import type { Signal } from 'weifuwu/client'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elem: string]: any
    }
  }
}

export {}
