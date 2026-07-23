export type NavigateHandler = (targetIndex: number) => void

export class PlayerControls {
  readonly element: HTMLDivElement
  readonly previousButton: HTMLButtonElement
  readonly replayButton: HTMLButtonElement
  readonly nextButton: HTMLButtonElement
  readonly pageIndicator: HTMLOutputElement

  private currentIndex = 0
  private readonly totalPages: number

  constructor(
    parent: HTMLElement,
    totalPages: number,
    private readonly onNavigate: NavigateHandler,
    private readonly onReplay?: () => void,
  ) {
    this.totalPages = Math.max(1, totalPages)
    this.element = document.createElement('div')
    this.element.className = 'lesson-controls'
    this.element.setAttribute('role', 'navigation')
    this.element.setAttribute('aria-label', '课件翻页')

    this.previousButton = document.createElement('button')
    this.previousButton.type = 'button'
    this.previousButton.className = 'lesson-control-button'
    this.previousButton.dataset.action = 'previous'
    this.previousButton.textContent = '上一页'
    this.previousButton.setAttribute('aria-label', '上一页')

    this.pageIndicator = document.createElement('output')
    this.pageIndicator.className = 'lesson-page-indicator'
    this.pageIndicator.dataset.role = 'page-indicator'
    this.pageIndicator.setAttribute('aria-live', 'polite')

    this.replayButton = document.createElement('button')
    this.replayButton.type = 'button'
    this.replayButton.className = 'lesson-control-button'
    this.replayButton.dataset.action = 'replay'
    this.replayButton.textContent = '重播'
    this.replayButton.setAttribute('aria-label', '重播本页')

    this.nextButton = document.createElement('button')
    this.nextButton.type = 'button'
    this.nextButton.className = 'lesson-control-button'
    this.nextButton.dataset.action = 'next'
    this.nextButton.textContent = '下一页'
    this.nextButton.setAttribute('aria-label', '下一页')

    this.element.append(
      this.previousButton,
      this.pageIndicator,
      this.replayButton,
      this.nextButton,
    )
    parent.append(this.element)

    this.previousButton.addEventListener('click', this.handlePrevious)
    this.replayButton.addEventListener('click', this.handleReplay)
    this.nextButton.addEventListener('click', this.handleNext)
    this.setIndex(0)
  }

  setIndex(index: number): void {
    this.currentIndex = Math.min(Math.max(0, index), this.totalPages - 1)
    this.previousButton.disabled = this.currentIndex === 0
    this.nextButton.disabled = this.currentIndex === this.totalPages - 1
    this.pageIndicator.value = `${this.currentIndex + 1} / ${this.totalPages}`
    this.pageIndicator.textContent = this.pageIndicator.value
  }

  destroy(): void {
    this.previousButton.removeEventListener('click', this.handlePrevious)
    this.replayButton.removeEventListener('click', this.handleReplay)
    this.nextButton.removeEventListener('click', this.handleNext)
    this.element.remove()
  }

  private readonly handlePrevious = (): void => {
    if (this.currentIndex > 0) {
      this.onNavigate(this.currentIndex - 1)
    }
  }

  private readonly handleNext = (): void => {
    if (this.currentIndex < this.totalPages - 1) {
      this.onNavigate(this.currentIndex + 1)
    }
  }

  private readonly handleReplay = (): void => {
    this.onReplay?.()
  }

}
