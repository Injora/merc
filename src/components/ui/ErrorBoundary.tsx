import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { fallback: ReactNode; children: ReactNode; onError?: (error: Error) => void }

/** Catches render/load failures (e.g. a missing GLB or a lost WebGL context) and shows a fallback. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[experience] falling back after error:', error.message, info.componentStack?.split('\n')[1]?.trim() ?? '')
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
