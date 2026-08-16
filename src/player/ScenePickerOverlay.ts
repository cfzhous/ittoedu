export interface ScenePickerScene {
  id: string
  name: string
}

export type ScenePickerLocationKind =
  | 'slide-scene'
  | 'flow-block'
  | 'spatial-camera'

export interface ScenePickerLocation {
  id: string
  locationId: string
  name: string
  kind: ScenePickerLocationKind
}

export const SCENE_PICKER_OPEN_EVENT = 'player:scene-picker:open'
export const TEACHER_CONTROLLER_COLLAPSE_EVENT =
  'player:teacher-controller:collapse-change'

export interface TeacherControllerCollapseEvent {
  nodeId: string
  collapsed: boolean
}

export interface ScenePickerOverlayOptions {
  stage: HTMLElement
  scenes: readonly ScenePickerScene[]
  /**
   * When provided, the picker lists course locations instead of slide scenes
   * and `onSelect` receives `locationId`. `scenes` stays only as a fallback
   * so existing callers keep compiling without changes.
   */
  locations?: readonly ScenePickerLocation[]
  onSelect(selectedId: string, bypassNavigationGuards: boolean): void
  onClose?(): void
}

export interface ScenePickerOpenOptions {
  bypassNavigationGuards?: boolean
}

let scenePickerSequence = 0

const scenePickerLocationKindLabels: Record<ScenePickerLocationKind, string> = {
  'slide-scene': '幻灯片',
  'flow-block': '讲义',
  'spatial-camera': '空间',
}

interface PickerEntry {
  buttonId: string
  selectionId: string
  name: string
  kind?: ScenePickerLocationKind
}

function applyStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(element.style, styles)
}

/**
 * Accessible delivery-time course directory. It intentionally lives outside
 * Phaser so long course lists retain native scrolling, focus and keyboard
 * semantics regardless of canvas scale. With `locations` it lists every
 * course location (slide/flow/spatial); without it the original scene-only
 * behavior is preserved exactly.
 */
export class ScenePickerOverlay {
  private readonly layer: HTMLDivElement
  private readonly closeButton: HTMLButtonElement
  private readonly itemButtons: HTMLButtonElement[] = []
  private readonly selectionIds: string[] = []
  private readonly useLocations: boolean
  private readonly onSelect: (
    selectedId: string,
    bypassNavigationGuards: boolean,
  ) => void
  private readonly onClose: (() => void) | undefined
  private restoreFocusTo: HTMLElement | null = null
  private openValue = false
  private bypassNavigationGuards = false
  private destroyed = false

  constructor(options: ScenePickerOverlayOptions) {
    this.onSelect = options.onSelect
    this.onClose = options.onClose
    this.useLocations = options.locations !== undefined

    const entries: PickerEntry[] = this.useLocations
      ? (options.locations as readonly ScenePickerLocation[]).map((location) => ({
          buttonId: location.id,
          selectionId: location.locationId,
          name: location.name,
          kind: location.kind,
        }))
      : options.scenes.map((scene) => ({
          buttonId: scene.id,
          selectionId: scene.id,
          name: scene.name,
        }))

    const instanceId = ++scenePickerSequence
    const titleId = `lesson-scene-picker-title-${instanceId}`
    const descriptionId = `lesson-scene-picker-description-${instanceId}`

    const layer = document.createElement('div')
    layer.className = 'lesson-scene-picker-layer'
    layer.hidden = true
    applyStyles(layer, {
      position: 'absolute',
      inset: '0',
      zIndex: '30',
      display: 'none',
      placeItems: 'center',
      padding: 'clamp(12px, 3vw, 32px)',
      background: 'rgba(5, 10, 20, 0.58)',
      backdropFilter: 'blur(3px)',
      pointerEvents: 'auto',
    })

    const dialog = document.createElement('section')
    dialog.className = 'lesson-scene-picker'
    dialog.dataset.scenePicker = 'true'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', titleId)
    dialog.setAttribute('aria-describedby', descriptionId)
    applyStyles(dialog, {
      display: 'flex',
      width: 'min(600px, 100%)',
      maxHeight: 'min(82%, 640px)',
      minHeight: '0',
      flexDirection: 'column',
      overflow: 'hidden',
      border: '1px solid rgba(231, 184, 92, 0.72)',
      borderRadius: '18px',
      color: '#f8fafc',
      background: 'rgba(19, 28, 46, 0.985)',
      boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
      fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif',
    })

    const header = document.createElement('header')
    applyStyles(header, {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '12px',
      alignItems: 'start',
      padding: '20px 22px 16px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
    })

    const headingGroup = document.createElement('div')
    const title = document.createElement('h2')
    title.id = titleId
    title.textContent = this.useLocations ? '课程内容' : '场景目录'
    applyStyles(title, {
      margin: '0',
      color: '#fff7df',
      fontSize: 'clamp(18px, 2.4vw, 24px)',
      lineHeight: '1.25',
    })
    const description = document.createElement('p')
    description.id = descriptionId
    description.textContent = this.useLocations
      ? `选择要跳转的课程内容，共 ${entries.length} 个`
      : `选择要跳转的场景，共 ${entries.length} 个`
    applyStyles(description, {
      margin: '6px 0 0',
      color: '#b9c5d8',
      fontSize: '13px',
      lineHeight: '1.45',
    })
    headingGroup.append(title, description)

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'lesson-scene-picker__close'
    closeButton.setAttribute(
      'aria-label',
      this.useLocations ? '关闭课程内容' : '关闭场景目录',
    )
    closeButton.textContent = '×'
    applyStyles(closeButton, {
      width: '38px',
      height: '38px',
      padding: '0',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '10px',
      color: '#f8fafc',
      background: 'rgba(255, 255, 255, 0.06)',
      font: '500 25px/1 Inter, sans-serif',
      cursor: 'pointer',
    })
    header.append(headingGroup, closeButton)

    const list = document.createElement('div')
    list.className = 'lesson-scene-picker__list'
    list.setAttribute('role', 'group')
    list.setAttribute('aria-label', this.useLocations ? '全部课程内容' : '全部场景')
    applyStyles(list, {
      display: 'grid',
      minHeight: '0',
      gap: '8px',
      overflowX: 'hidden',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      padding: '14px 16px 18px',
      scrollbarGutter: 'stable',
    })

    entries.forEach((entry, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'lesson-scene-picker__item'
      if (this.useLocations) {
        button.dataset.locationId = entry.selectionId
        if (entry.kind) button.dataset.kind = entry.kind
      } else {
        button.dataset.sceneId = entry.selectionId
      }
      applyStyles(button, {
        display: 'grid',
        width: '100%',
        minHeight: '52px',
        gridTemplateColumns: this.useLocations
          ? '42px auto minmax(0, 1fr)'
          : '42px minmax(0, 1fr)',
        gap: '12px',
        alignItems: 'center',
        padding: '9px 14px',
        border: '1px solid rgba(148, 163, 184, 0.24)',
        borderRadius: '12px',
        color: '#edf2f8',
        background: 'rgba(255, 255, 255, 0.045)',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      })

      const number = document.createElement('span')
      number.setAttribute('aria-hidden', 'true')
      number.textContent = String(index + 1).padStart(2, '0')
      applyStyles(number, {
        color: '#e7b85c',
        fontSize: '12px',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.08em',
      })
      button.append(number)

      if (this.useLocations && entry.kind) {
        const kind = document.createElement('span')
        kind.textContent = scenePickerLocationKindLabels[entry.kind]
        kind.setAttribute('aria-hidden', 'true')
        applyStyles(kind, {
          padding: '2px 7px',
          border: '1px solid rgba(125, 211, 252, 0.35)',
          borderRadius: '999px',
          color: '#7dd3fc',
          fontSize: '11px',
          fontWeight: '700',
          whiteSpace: 'nowrap',
        })
        button.append(kind)
      }

      const name = document.createElement('span')
      name.textContent = entry.name
      applyStyles(name, {
        minWidth: '0',
        overflow: 'hidden',
        fontSize: '15px',
        fontWeight: '600',
        lineHeight: '1.35',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      })
      button.append(name)
      button.addEventListener('click', () => {
        if (this.destroyed) return
        const bypassNavigationGuards = this.bypassNavigationGuards
        this.close()
        this.onSelect(entry.selectionId, bypassNavigationGuards)
      })
      list.append(button)
      this.itemButtons.push(button)
      this.selectionIds.push(entry.selectionId)
    })

    dialog.append(header, list)
    layer.append(dialog)
    options.stage.append(layer)

    this.layer = layer
    this.closeButton = closeButton
    this.closeButton.addEventListener('click', this.handleCloseClick)
    this.layer.addEventListener('click', this.handleLayerClick)
    this.layer.addEventListener('keydown', this.handleKeyDown)
  }

  get isOpen(): boolean {
    return this.openValue
  }

  open(
    currentSelectionId: string | null,
    options: ScenePickerOpenOptions = {},
  ): void {
    if (this.destroyed) return
    this.bypassNavigationGuards = options.bypassNavigationGuards ?? false
    if (!this.openValue) {
      this.restoreFocusTo = document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
        ? document.activeElement
        : null
    }
    this.openValue = true
    this.layer.hidden = false
    this.layer.style.display = 'grid'

    this.itemButtons.forEach((button, index) => {
      const current = this.selectionIds[index] === currentSelectionId
      if (current) {
        button.setAttribute('aria-current', 'page')
        button.style.borderColor = 'rgba(231, 184, 92, 0.94)'
        button.style.background = 'rgba(231, 184, 92, 0.16)'
        button.style.boxShadow = 'inset 3px 0 0 #e7b85c'
      } else {
        button.removeAttribute('aria-current')
        button.style.borderColor = 'rgba(148, 163, 184, 0.24)'
        button.style.background = 'rgba(255, 255, 255, 0.045)'
        button.style.boxShadow = 'none'
      }
    })

    const currentButton = this.itemButtons.find(
      (_, index) => this.selectionIds[index] === currentSelectionId,
    )
    const focusTarget = currentButton ?? this.itemButtons[0] ?? this.closeButton
    queueMicrotask(() => {
      if (!this.openValue || this.destroyed) return
      focusTarget.focus({ preventScroll: true })
      if (typeof focusTarget.scrollIntoView === 'function') {
        focusTarget.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  close(restoreFocus = true): void {
    if (!this.openValue) {
      this.bypassNavigationGuards = false
      return
    }
    this.openValue = false
    this.bypassNavigationGuards = false
    this.layer.hidden = true
    this.layer.style.display = 'none'
    this.onClose?.()
    const restoreTarget = this.restoreFocusTo
    this.restoreFocusTo = null
    if (restoreFocus && restoreTarget?.isConnected) {
      queueMicrotask(() => restoreTarget.focus({ preventScroll: true }))
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.close(false)
    this.destroyed = true
    this.closeButton.removeEventListener('click', this.handleCloseClick)
    this.layer.removeEventListener('click', this.handleLayerClick)
    this.layer.removeEventListener('keydown', this.handleKeyDown)
    this.layer.remove()
  }

  private readonly handleCloseClick = (): void => {
    this.close()
  }

  private readonly handleLayerClick = (event: MouseEvent): void => {
    if (event.target === this.layer) this.close()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.openValue) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.close()
      return
    }

    const focusables = [this.closeButton, ...this.itemButtons]
    const activeIndex = focusables.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Tab') {
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault()
        focusables.at(-1)?.focus()
      } else if (!event.shiftKey && activeIndex === focusables.length - 1) {
        event.preventDefault()
        focusables[0]?.focus()
      }
      return
    }

    let target: HTMLButtonElement | undefined
    const itemIndex = this.itemButtons.indexOf(
      document.activeElement as HTMLButtonElement,
    )
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      target = this.itemButtons[(Math.max(-1, itemIndex) + 1) % this.itemButtons.length]
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      target = this.itemButtons[
        itemIndex <= 0 ? this.itemButtons.length - 1 : itemIndex - 1
      ]
    } else if (event.key === 'Home') {
      target = this.itemButtons[0]
    } else if (event.key === 'End') {
      target = this.itemButtons.at(-1)
    }

    if (
      event.key === 'ArrowDown' || event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' || event.key === 'ArrowLeft' ||
      event.key === 'Home' || event.key === 'End'
    ) {
      event.preventDefault()
      event.stopPropagation()
      target?.focus()
    }
  }
}
