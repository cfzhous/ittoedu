import { buildFlowOutline, type FlowSurfaceDocument } from './flowModel'

export const FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX = 280

export interface FlowRuntimeTocEntry {
  readonly blockId: string
  readonly title: string
  readonly level: number
  readonly kind: 'heading' | 'section'
  readonly anchorId: string
}

export function flowRuntimeTocAnchorId(blockId: string): string {
  return `flow-toc-${blockId}`
}

export function buildFlowRuntimeToc(document: FlowSurfaceDocument): FlowRuntimeTocEntry[] {
  return buildFlowOutline(document).map((item) => ({
    blockId: item.blockId,
    title: item.text.trim() || (item.kind === 'section' ? '分节' : '标题'),
    level: item.level,
    kind: item.kind,
    anchorId: flowRuntimeTocAnchorId(item.blockId),
  }))
}

function applyTriangle(chevron: HTMLElement, direction: 'left' | 'right'): void {
  chevron.dataset.flowRuntimeTocChevron = direction
  chevron.style.display = 'block'
  chevron.style.width = '0'
  chevron.style.height = '0'
  chevron.style.borderTop = '7px solid transparent'
  chevron.style.borderBottom = '7px solid transparent'
  if (direction === 'left') {
    chevron.style.borderRight = '8px solid #ffffff'
    chevron.style.borderLeft = '0'
  } else {
    chevron.style.borderLeft = '8px solid #ffffff'
    chevron.style.borderRight = '0'
  }
}

export class FlowRuntimeTocChrome {
  #root: HTMLElement
  #drawer: HTMLElement
  #toggle: HTMLButtonElement
  #list: HTMLElement
  #chevron: HTMLElement
  #open = false
  #getEntries: () => readonly FlowRuntimeTocEntry[]
  #onNavigate: (entry: FlowRuntimeTocEntry) => void

  constructor(
    root: HTMLElement,
    options: {
      getEntries(): readonly FlowRuntimeTocEntry[]
      onNavigate(entry: FlowRuntimeTocEntry): void
    },
  ) {
    this.#root = root
    this.#getEntries = options.getEntries
    this.#onNavigate = options.onNavigate
    const dom = root.ownerDocument

    this.#drawer = dom.createElement('nav')
    this.#drawer.className = 'flow-runtime-toc-drawer'
    this.#drawer.dataset.testid = 'flow-runtime-toc-drawer'
    this.#drawer.setAttribute('aria-label', '目录')
    this.#drawer.style.position = 'fixed'
    this.#drawer.style.top = '0'
    this.#drawer.style.left = '0'
    this.#drawer.style.bottom = '0'
    this.#drawer.style.width = `${FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX}px`
    this.#drawer.style.zIndex = '29'
    this.#drawer.style.boxSizing = 'border-box'
    this.#drawer.style.padding = '16px 12px'
    this.#drawer.style.overflow = 'auto'
    this.#drawer.style.background = '#172033'
    this.#drawer.style.color = '#f8fafc'
    this.#drawer.style.transition = 'transform 160ms ease'
    this.#drawer.addEventListener('keydown', this.#onDrawerKeyDown)

    const heading = dom.createElement('h2')
    heading.textContent = '目录'
    heading.style.margin = '0 0 12px'
    heading.style.fontSize = '14px'
    this.#drawer.appendChild(heading)

    this.#list = dom.createElement('ul')
    this.#list.className = 'flow-runtime-toc-list'
    this.#list.style.listStyle = 'none'
    this.#list.style.margin = '0'
    this.#list.style.padding = '0'
    this.#drawer.appendChild(this.#list)

    this.#toggle = dom.createElement('button')
    this.#toggle.type = 'button'
    this.#toggle.className = 'flow-runtime-toc-toggle'
    this.#toggle.dataset.testid = 'flow-runtime-toc-toggle'
    this.#toggle.style.position = 'fixed'
    this.#toggle.style.top = '50%'
    this.#toggle.style.transform = 'translateY(-50%)'
    this.#toggle.style.zIndex = '30'
    this.#toggle.style.width = '16px'
    this.#toggle.style.height = '48px'
    this.#toggle.style.padding = '0'
    this.#toggle.style.border = '0'
    this.#toggle.style.borderRadius = '0 6px 6px 0'
    this.#toggle.style.background = '#2563eb'
    this.#toggle.style.display = 'grid'
    this.#toggle.style.placeItems = 'center'
    this.#toggle.style.cursor = 'pointer'
    this.#toggle.addEventListener('click', this.#onToggle)

    this.#chevron = dom.createElement('span')
    this.#chevron.setAttribute('aria-hidden', 'true')
    this.#toggle.appendChild(this.#chevron)

    root.appendChild(this.#drawer)
    root.appendChild(this.#toggle)
    this.sync()
  }

  get open(): boolean {
    return this.#open
  }

  setOpen(open: boolean): void {
    if (this.#open === open) {
      this.#applyChrome()
      return
    }
    this.#open = open
    this.#applyChrome()
  }

  sync(): void {
    this.#renderEntries()
    this.#applyChrome()
  }

  destroy(): void {
    this.#toggle.removeEventListener('click', this.#onToggle)
    this.#drawer.removeEventListener('keydown', this.#onDrawerKeyDown)
    this.#drawer.remove()
    this.#toggle.remove()
  }

  #onToggle = (): void => {
    this.setOpen(!this.#open)
  }

  #onDrawerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.setOpen(false)
      this.#toggle.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...this.#list.querySelectorAll<HTMLButtonElement>('[data-flow-runtime-toc-item]')]
    if (items.length === 0) return
    const current = this.#root.ownerDocument.activeElement
    const index = items.findIndex((item) => item === current)
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(items.length - 1, Math.max(0, index) + 1)
      : Math.max(0, (index < 0 ? items.length : index) - 1)
    event.preventDefault()
    items[nextIndex]?.focus()
  }

  #applyChrome(): void {
    this.#drawer.dataset.tocOpen = this.#open ? 'true' : 'false'
    this.#toggle.dataset.tocOpen = this.#open ? 'true' : 'false'
    this.#toggle.setAttribute('aria-expanded', this.#open ? 'true' : 'false')
    this.#toggle.setAttribute('aria-label', this.#open ? '收起目录' : '展开目录')
    this.#drawer.style.transform = this.#open ? 'translateX(0)' : 'translateX(-100%)'
    this.#drawer.style.pointerEvents = this.#open ? 'auto' : 'none'
    this.#toggle.style.left = this.#open ? `${FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX}px` : '0'
    applyTriangle(this.#chevron, this.#open ? 'left' : 'right')
  }

  #renderEntries(): void {
    const entries = this.#getEntries()
    this.#list.replaceChildren()
    const dom = this.#root.ownerDocument
    for (const entry of entries) {
      const item = dom.createElement('li')
      const button = dom.createElement('button')
      button.type = 'button'
      button.dataset.flowRuntimeTocItem = 'true'
      button.dataset.flowTocBlockId = entry.blockId
      button.dataset.flowTocAnchor = entry.anchorId
      button.setAttribute(
        'aria-label',
        `跳转到${entry.kind === 'section' ? '分节' : `标题 ${entry.level}`}：${entry.title}`,
      )
      button.textContent = entry.title
      button.style.display = 'block'
      button.style.width = '100%'
      button.style.textAlign = 'left'
      button.style.padding = `6px 8px 6px ${8 + Math.max(0, entry.level - 1) * 12}px`
      button.style.border = '0'
      button.style.background = 'transparent'
      button.style.color = 'inherit'
      button.style.cursor = 'pointer'
      button.addEventListener('click', () => this.#onNavigate(entry))
      item.appendChild(button)
      this.#list.appendChild(item)
    }
  }
}
