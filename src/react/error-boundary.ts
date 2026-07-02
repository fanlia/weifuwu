/**
 * SSR-safe error boundary.
 *
 * Catches React render errors on both server and client:
 * - Server (SSR): renders fallback HTML instead of crashing
 * - Client (hydration): catches errors, shows fallback
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <UserProfile />
 * </ErrorBoundary>
 * ```
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

export interface ErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
  /** Called when an error is caught (both SSR and client). */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback as ReactNode
    }
    return this.props.children
  }
}
