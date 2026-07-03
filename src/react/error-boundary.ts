import { createElement, Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Fallback UI rendered when a child component throws. */
  fallback?: ReactNode
  /** Called with the error (client-side only). */
  onError?: (error: Error) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Catch render errors in child components.
 * Works during SSR (renders fallback) and client-side hydration.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *   <RiskyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return createElement('div', { style: { padding: '2rem', textAlign: 'center' } },
        createElement('h1', null, 'Something went wrong'),
        createElement('p', null, this.state.error?.message ?? 'Unknown error'),
      )
    }
    return this.props.children
  }
}
