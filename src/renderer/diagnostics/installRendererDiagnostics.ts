function reasonDetails(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name, stack: reason.stack }
  }
  return { message: String(reason) }
}

export function installRendererDiagnostics(): () => void {
  const report = (reason: unknown): void => {
    if (!window.desktopAPI?.reportDiagnostic) return
    const details = reasonDetails(reason)
    void window.desktopAPI.reportDiagnostic({
      source: 'renderer',
      ...details,
    }).catch(() => undefined)
  }
  const onError = (event: ErrorEvent): void => report(event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent): void => report(event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
