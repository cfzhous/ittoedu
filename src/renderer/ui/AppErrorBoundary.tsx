import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

function errorMessage(error: Error): string {
  const message = error.message.trim()
  return message || '编辑器界面发生未知错误。'
}

/**
 * Last-resort renderer protection. Feature-level failures should still be
 * handled close to their owner (component, preview, export, and so on), while
 * this boundary prevents an uncaught React error from leaving a blank window.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('编辑器界面发生未捕获错误', error, info.componentStack)
    if (window.desktopAPI?.reportDiagnostic) {
      void window.desktopAPI.reportDiagnostic({
        source: 'renderer',
        message: error.message || error.name,
        stack: [error.stack, info.componentStack].filter(Boolean).join('\n'),
      }).catch(() => undefined)
    }
  }

  private reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="app-crash" role="alert">
        <section className="app-crash__panel">
          <strong>编辑器界面发生错误</strong>
          <p>{errorMessage(error)}</p>
          <p className="app-crash__hint">
            本地恢复副本会尽量保留最近修改。重新载入后如出现恢复提示，请先恢复并另存工程。
          </p>
          <button type="button" className="primary-button" onClick={this.reload}>
            重新载入编辑器
          </button>
        </section>
      </main>
    )
  }
}
