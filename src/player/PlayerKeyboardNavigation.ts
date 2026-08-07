export type KeyboardNavigateHandler = (targetIndex: number) => void

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return true
  }

  return Boolean(
    target.closest(
      '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
    ),
  )
}

/**
 * Keyboard-only scene navigation. It intentionally owns no DOM controls so
 * canvas-authored controllers and keyboard input can use it independently.
 */
export class PlayerKeyboardNavigation {
  private currentIndex = 0
  private readonly totalPages: number
  private destroyed = false

  constructor(
    totalPages: number,
    private readonly onNavigate: KeyboardNavigateHandler,
  ) {
    this.totalPages = Math.max(1, Math.trunc(totalPages))
    window.addEventListener('keydown', this.handleKeyDown)
  }

  setIndex(index: number): void {
    if (!Number.isFinite(index)) return
    this.currentIndex = Math.min(
      Math.max(0, Math.trunc(index)),
      this.totalPages - 1,
    )
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    window.removeEventListener('keydown', this.handleKeyDown)
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      this.destroyed ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target)
    ) {
      return
    }

    let targetIndex: number | null = null
    if (event.key === 'ArrowLeft' && this.currentIndex > 0) {
      targetIndex = this.currentIndex - 1
    } else if (
      event.key === 'ArrowRight' &&
      this.currentIndex < this.totalPages - 1
    ) {
      targetIndex = this.currentIndex + 1
    }

    if (targetIndex === null) return
    event.preventDefault()
    this.onNavigate(targetIndex)
  }
}
