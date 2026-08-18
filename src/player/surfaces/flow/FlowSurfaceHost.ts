import { serializeFormulaAst } from '../../../shared/formulaLinear'
import type { TeacherControllerAction, TextRun } from '../../../shared/projectTypes'
import type { CourseAudioApi } from '../../AudioManager'
import type { FlowBlock } from '../../../shared/courseProjectTypes'
import { isGlobalLayerItemVisible } from '../../globalLayerVisibility'
import {
  TeacherControllerDom,
  teacherControllerDomNode,
  type TeacherControllerDomSession,
} from '../../teacherControllerDom'
import type { TeacherControllerSceneInfo } from '../../../shared/teacherControllerLayout'
import type {
  PublishedFlowSurface,
  PublishedLayerItem,
  PublishedNativeLayerItem,
  PublishedScopedLayerItem,
} from '../../../shared/publishedCourseTypes'
import {
  FLOW_LOGICAL_CANVAS,
  cloneJson,
  findPublishedFlowSurface,
  flowPageStartLocationId,
  flowRichTextSegments,
  flowSurfaceOrder,
  flowTableCellText,
  resolveFlowLocation,
  resolvePlaybackAssetUrl,
  toFlowPublishedPlayback,
  type FlowPublishedPlaybackDocument,
  type FlowPublishedPlaybackSource,
} from './flowModel'
import {
  FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX,
  FlowRuntimeTocChrome,
  buildFlowRuntimeToc,
  flowRuntimeTocAnchorId,
  flowRuntimeTocPageAnchorId,
  type FlowRuntimeTocEntry,
} from './flowRuntimeToc'

export interface FlowCourseProgressSource {
  getLocations(): readonly TeacherControllerSceneInfo[]
  getCurrentLocationId(): string | null
  getStateLabel(): string | null
}

export interface FlowSurfaceHostOptions {
  surfaceId?: string
  locationId?: string
  /** Runtime-session only. Default is collapsed (scheme 1). */
  initialTocOpen?: boolean
  resolveAsset?: (assetId: string) => string | undefined
  audio?: Pick<CourseAudioApi, 'muted' | 'setMuted' | 'toggleMuted'>
  executeTeacherControllerAction?: (
    action: TeacherControllerAction,
  ) => boolean | void | Promise<boolean | void>
  onNavigateLocation?: (locationId: string) => void
  courseProgressSource?: FlowCourseProgressSource
}

export interface FlowHostAudioSession {
  muted(): boolean
  setMuted(value: boolean): void
  toggleMuted(): boolean
}

/**
 * Playback host for Published Course V2 Flow surfaces. It never reads authoring
 * DOM as the document source. Overlay teacher-controller uses the shared DOM
 * controller; it is not a document footer. TOC chrome is session-only.
 */
export class FlowSurfaceHost {
  readonly kind = 'flow' as const
  #playback: FlowPublishedPlaybackDocument
  #surfaceId: string
  #locationId: string
  #options: FlowSurfaceHostOptions
  #audio: FlowHostAudioSession
  #container: HTMLElement | null = null
  #root: HTMLElement | null = null
  #article: HTMLElement | null = null
  #overlay: HTMLElement | null = null
  #toc: FlowRuntimeTocChrome | null = null
  #controller: TeacherControllerDom | null = null
  #controllerSessions = new Map<string, TeacherControllerDomSession>()
  #active = false
  #queue: Promise<void> = Promise.resolve()

  constructor(source: FlowPublishedPlaybackSource, options: FlowSurfaceHostOptions = {}) {
    this.#playback = toFlowPublishedPlayback(source)
    this.#options = { ...options }
    this.#audio = options.audio ?? createFlowHostAudioSession(
      this.#playback.media?.audio.defaultMuted === true,
    )
    const requestedLocation = options.locationId ?? this.#playback.startLocationId
    const resolved = tryResolveLocation(this.#playback, requestedLocation)
      ?? tryResolveLocation(this.#playback, this.#playback.startLocationId)
      ?? {
        id: flowPageStartLocationId(this.#playback, this.#playback.surfaces[0]!.id),
        surfaceId: this.#playback.surfaces[0]!.id,
      }
    this.#surfaceId = options.surfaceId
      ?? resolved.surfaceId
    this.#locationId = resolved.id
    findPublishedFlowSurface(this.#playback, this.#surfaceId)
  }

  get surfaceId(): string {
    return this.#surfaceId
  }

  get locationId(): string {
    return this.#locationId
  }

  get playbackDocument(): FlowPublishedPlaybackDocument {
    return cloneJson(this.#playback)
  }

  get surface(): PublishedFlowSurface {
    return cloneJson(findPublishedFlowSurface(this.#playback, this.#surfaceId))
  }

  get tocOpen(): boolean {
    return this.#toc?.open ?? false
  }

  get rootElement(): HTMLElement | null {
    return this.#root
  }

  setTocOpen(open: boolean): void {
    this.#toc?.setOpen(open)
  }

  mount(container: HTMLElement): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#container) throw new Error('Flow surface is already mounted')
      this.#container = container
      const dom = container.ownerDocument
      const root = dom.createElement('section')
      root.className = 'flow-surface-host'
      root.dataset.surfaceId = this.#surfaceId
      root.style.position = 'relative'
      root.style.isolation = 'isolate'
      root.style.height = '100%'
      root.style.minHeight = '100%'
      root.style.overflow = 'hidden'
      root.style.setProperty('--flow-toc-inset', '0px')
      root.hidden = !this.#active

      const overlay = dom.createElement('div')
      overlay.className = 'flow-runtime-overlay'
      overlay.dataset.testid = 'flow-runtime-overlay'
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.right = '0'
      overlay.style.bottom = '0'
      overlay.style.left = '0'
      overlay.style.zIndex = '20'
      overlay.style.pointerEvents = 'none'
      overlay.style.overflow = 'hidden'
      root.appendChild(overlay)

      container.appendChild(root)
      this.#root = root
      this.#overlay = overlay
      this.#toc = new FlowRuntimeTocChrome(root, {
        initialOpen: this.#options.initialTocOpen === true,
        getEntries: () => buildFlowRuntimeToc(this.#playback),
        onNavigate: (entry) => {
          void this.#navigateToc(entry)
        },
        onOpenChange: () => this.#applyShellLayout(),
      })
      this.#render()
      this.#applyShellLayout()
    })
  }

  async activate(): Promise<void> {
    this.#active = true
    if (this.#root) this.#root.hidden = false
  }

  async suspend(): Promise<void> {
    this.#active = false
    if (this.#root) this.#root.hidden = true
  }

  async resume(): Promise<void> {
    return this.activate()
  }

  setLocationId(locationId: string): Promise<void> {
    return this.#enqueue(async () => {
      const location = resolveFlowLocation(this.#playback, locationId)
      this.#locationId = location.id
      this.#surfaceId = location.surfaceId
      if (this.#root) this.#root.dataset.surfaceId = this.#surfaceId
      this.#render()
      this.#applyShellLayout()
      this.#scrollToAnchor(
        location.blockId
          ? flowRuntimeTocAnchorId(location.blockId)
          : flowRuntimeTocPageAnchorId(location.surfaceId),
      )
    })
  }

  updatePublishedCourse(source: FlowPublishedPlaybackSource): Promise<void> {
    return this.#enqueue(async () => {
      this.#playback = toFlowPublishedPlayback(source)
      if (!this.#playback.surfaces.some((surface) => surface.id === this.#surfaceId)) {
        this.#surfaceId = this.#playback.surfaces[0]!.id
        this.#locationId = flowPageStartLocationId(this.#playback, this.#surfaceId)
      }
      if (this.#root) this.#root.dataset.surfaceId = this.#surfaceId
      this.#render()
      this.#toc?.sync()
      this.#applyShellLayout()
    })
  }

  destroy(): Promise<void> {
    return this.#enqueue(async () => {
      this.#destroyController()
      this.#toc?.destroy()
      this.#toc = null
      this.#root?.remove()
      this.#root = null
      this.#article = null
      this.#overlay = null
      this.#container = null
      this.#active = false
    })
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation)
    this.#queue = result.then(() => undefined, () => undefined)
    return result
  }

  #applyShellLayout(): void {
    const inset = this.tocOpen ? `${FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX}px` : '0px'
    if (this.#article) this.#article.style.marginLeft = inset
    if (this.#overlay) this.#overlay.style.left = inset
  }

  #render(): void {
    if (!this.#root || !this.#overlay) return
    const surface = findPublishedFlowSurface(this.#playback, this.#surfaceId)
    const article = renderFlowArticle(surface, {
      playback: this.#playback,
      resolveAsset: this.#options.resolveAsset,
      dom: this.#root.ownerDocument,
    })
    this.#article?.remove()
    this.#root.insertBefore(article, this.#overlay)
    this.#article = article
    this.#toc?.sync()
    this.#renderOverlay(surface)
  }

  #renderOverlay(surface: PublishedFlowSurface): void {
    const overlay = this.#overlay
    if (!overlay) return
    this.#destroyController()
    overlay.replaceChildren()
    const entries = visibleOverlayEntries(this.#playback, surface, this.#locationId)
    for (const entry of entries) {
      if (isPublishedTeacherController(entry.item)) {
        this.#mountTeacherController(entry.item)
        continue
      }
      overlay.appendChild(renderStaticOverlayItem(
        overlay.ownerDocument,
        entry,
        (assetId) => resolvePlaybackAssetUrl(this.#playback, assetId, this.#options.resolveAsset),
      ))
    }
  }

  #mountTeacherController(item: PublishedNativeLayerItem): void {
    const overlay = this.#overlay
    if (!overlay || item.content.nativeType !== 'teacher-controller') return
    const data = item.content.data
    const frame = item.frame
    const dom = overlay.ownerDocument
    const frameEl = dom.createElement('div')
    frameEl.className = 'flow-runtime-teacher-controller-frame'
    frameEl.dataset.testid = 'flow-runtime-teacher-controller'
    frameEl.dataset.layerItemId = item.layerItemId
    frameEl.style.position = 'absolute'
    frameEl.style.left = `${frame.x}px`
    frameEl.style.top = `${frame.y}px`
    frameEl.style.width = `${frame.width}px`
    frameEl.style.height = `${frame.height}px`
    frameEl.style.pointerEvents = 'auto'
    frameEl.style.zIndex = String(item.order)
    overlay.appendChild(frameEl)

    if (!this.#controllerSessions.has(item.layerItemId)) {
      this.#controllerSessions.set(item.layerItemId, {
        offset: { dx: 0, dy: 0 },
        collapsed: data.defaultCollapsed === true,
      })
    }

    const node = teacherControllerDomNode(
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      item.rotation,
      {
        title: data.title,
        compact: data.compact,
        showSceneProgress: data.showSceneProgress,
        collapsible: data.collapsible,
        buttons: data.buttons,
        style: data.style,
      },
    )
    const scenes = this.#controllerScenes()
    this.#controller = new TeacherControllerDom({
      node,
      container: frameEl,
      canvas: { ...FLOW_LOGICAL_CANVAS },
      getRenderedStageBounds: () => {
        const bounds = overlay.getBoundingClientRect()
        return {
          width: Math.max(1, bounds.width || FLOW_LOGICAL_CANVAS.width),
          height: Math.max(1, bounds.height || FLOW_LOGICAL_CANVAS.height),
        }
      },
      scenes,
      getCurrentSceneId: () => this.#surfaceId,
      getStateLabel: () => this.#options.courseProgressSource?.getStateLabel() ?? null,
      getStatus: () => ({
        muted: this.#audio.muted(),
        fullscreen: Boolean(overlay.ownerDocument.fullscreenElement),
      }),
      getSession: () => this.#controllerSessions.get(item.layerItemId) ?? {
        offset: { dx: 0, dy: 0 },
        collapsed: false,
      },
      onSessionChange: (next) => {
        this.#controllerSessions.set(item.layerItemId, next)
      },
      onAction: (action) => {
        void this.#handleControllerAction(action)
      },
      getInteractive: () => this.#active,
    })
  }

  #destroyController(): void {
    this.#controller?.destroy()
    this.#controller = null
  }

  #controllerScenes(): TeacherControllerSceneInfo[] {
    if (this.#options.courseProgressSource) {
      return [...this.#options.courseProgressSource.getLocations()]
    }
    return flowSurfaceOrder(this.#playback).map((surfaceId) => {
      const surface = findPublishedFlowSurface(this.#playback, surfaceId)
      return { id: surface.id, name: surface.title }
    })
  }

  async #handleControllerAction(action: TeacherControllerAction): Promise<void> {
    if (this.#options.executeTeacherControllerAction) {
      await this.#options.executeTeacherControllerAction(action)
      this.#controller?.refreshStatus()
      return
    }
    if (action.type === 'audio.toggle-mute') {
      this.#audio.toggleMuted()
      this.#controller?.refreshStatus()
      return
    }
    if (action.type === 'player.fullscreen.toggle') {
      const dom = this.#root?.ownerDocument
      if (!dom) return
      if (dom.fullscreenElement) await dom.exitFullscreen?.()
      else await this.#root?.requestFullscreen?.()
      this.#controller?.refreshStatus()
      return
    }
    const order = flowSurfaceOrder(this.#playback)
    const index = order.indexOf(this.#surfaceId)
    if (action.type === 'scene.next' && index >= 0 && index < order.length - 1) {
      await this.#goToSurface(order[index + 1]!)
      return
    }
    if (action.type === 'scene.previous' && index > 0) {
      await this.#goToSurface(order[index - 1]!)
      return
    }
    if (action.type === 'course.restart' || action.type === 'scene.replay') {
      await this.setLocationId(this.#playback.startLocationId)
    }
  }

  async #goToSurface(surfaceId: string): Promise<void> {
    const locationId = flowPageStartLocationId(this.#playback, surfaceId)
    this.#options.onNavigateLocation?.(locationId)
    await this.setLocationId(locationId)
  }

  async #navigateToc(entry: FlowRuntimeTocEntry): Promise<void> {
    const locationId = entry.locationId ?? (
      entry.kind === 'page'
        ? flowPageStartLocationId(this.#playback, entry.surfaceId)
        : undefined
    )
    if (entry.surfaceId !== this.#surfaceId && locationId) {
      this.#options.onNavigateLocation?.(locationId)
      await this.setLocationId(locationId)
    }
    this.#scrollToAnchor(entry.anchorId)
  }

  #scrollToAnchor(anchorId: string): void {
    const target = this.#article?.querySelector<HTMLElement>(`#${cssEscape(anchorId)}`)
    target?.scrollIntoView({ block: 'start' })
  }
}

function tryResolveLocation(
  playback: FlowPublishedPlaybackDocument,
  locationId: string,
): { id: string; surfaceId: string } | null {
  try {
    const location = resolveFlowLocation(playback, locationId)
    return { id: location.id, surfaceId: location.surfaceId }
  } catch {
    return null
  }
}

function createFlowHostAudioSession(defaultMuted: boolean): FlowHostAudioSession {
  let muted = defaultMuted
  return {
    muted: () => muted,
    setMuted: (value) => {
      muted = value
    },
    toggleMuted: () => {
      muted = !muted
      return muted
    },
  }
}

function visibleOverlayEntries(
  playback: FlowPublishedPlaybackDocument,
  surface: PublishedFlowSurface,
  locationId: string,
): Array<{ item: PublishedLayerItem; source: 'global' | 'surface' }> {
  const entries: Array<{ item: PublishedLayerItem; source: 'global' | 'surface'; order: number }> = []
  const push = (list: readonly PublishedScopedLayerItem[], source: 'global' | 'surface') => {
    for (const entry of list) {
      if (!isPublishedScopedVisible(entry, locationId)) continue
      if (!entry.item.visible || entry.item.playbackInitialVisibility === 'hidden') continue
      entries.push({ item: entry.item, source, order: entry.item.order })
    }
  }
  push(playback.globalLayerItems, 'global')
  push(surface.surfaceLayerItems, 'surface')
  return entries
    .sort((left, right) => left.order - right.order || left.item.layerItemId.localeCompare(right.item.layerItemId))
    .map(({ item, source }) => ({ item, source }))
}

function isPublishedScopedVisible(entry: PublishedScopedLayerItem, locationId: string): boolean {
  return isGlobalLayerItemVisible(
    { visibility: { mode: entry.visibility.mode, sceneIds: entry.visibility.locationIds } },
    locationId,
  )
}

function isPublishedTeacherController(
  item: PublishedLayerItem,
): item is PublishedNativeLayerItem & {
  content: Extract<PublishedNativeLayerItem['content'], { nativeType: 'teacher-controller' }>
} {
  return item.kind === 'native' && item.content.nativeType === 'teacher-controller'
}

function renderStaticOverlayItem(
  dom: Document,
  entry: { item: PublishedLayerItem; source: 'global' | 'surface' },
  resolveAsset: (assetId: string) => string | undefined,
): HTMLElement {
  const wrap = dom.createElement('div')
  wrap.dataset.flowOverlayItem = entry.item.layerItemId
  wrap.dataset.flowOverlaySource = entry.source
  wrap.style.position = 'absolute'
  wrap.style.left = `${entry.item.frame.x}px`
  wrap.style.top = `${entry.item.frame.y}px`
  wrap.style.width = `${entry.item.frame.width}px`
  wrap.style.height = `${entry.item.frame.height}px`
  wrap.style.opacity = String(entry.item.opacity)
  wrap.style.pointerEvents = 'none'
  wrap.style.zIndex = String(entry.item.order)
  if (entry.item.kind === 'native' && entry.item.content.nativeType === 'image') {
    const url = resolveAsset(entry.item.content.data.assetId)
    if (url) {
      const image = dom.createElement('img')
      image.src = url
      image.alt = ''
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'contain'
      wrap.appendChild(image)
      return wrap
    }
  }
  if (entry.item.kind === 'native' && entry.item.content.nativeType === 'text') {
    wrap.textContent = entry.item.content.data.text
    return wrap
  }
  const fallback = entry.item.kind === 'component'
    ? entry.item.staticFallbackAssetId
    : entry.item.kind === 'runtime'
      ? entry.item.runtime.staticFallback?.assetId
      : undefined
  if (fallback) {
    const url = resolveAsset(fallback)
    if (url) {
      const image = dom.createElement('img')
      image.src = url
      image.alt = ''
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'contain'
      wrap.appendChild(image)
    }
  }
  return wrap
}

function renderFlowArticle(
  surface: PublishedFlowSurface,
  options: {
    playback: FlowPublishedPlaybackDocument
    resolveAsset?: (assetId: string) => string | undefined
    dom: Document
  },
): HTMLElement {
  const { dom } = options
  const article = dom.createElement('article')
  article.className = 'flow-runtime-article'
  article.dataset.testid = 'flow-runtime-article'
  article.id = flowRuntimeTocPageAnchorId(surface.id)
  article.style.boxSizing = 'border-box'
  article.style.height = '100%'
  article.style.overflow = 'auto'
  article.style.background = '#f8fafc'
  article.style.color = '#172033'

  const reading = dom.createElement('div')
  reading.className = 'flow-runtime-reading'
  reading.style.maxWidth = `${surface.layout.readingWidth}px`
  reading.style.margin = '0 auto'
  reading.style.padding = '24px 32px 120px'
  article.appendChild(reading)

  for (const block of surface.blocks) {
    renderBlockDom(block, reading, options)
  }
  return article
}

function renderBlockDom(
  block: FlowBlock,
  parent: HTMLElement,
  options: {
    playback: FlowPublishedPlaybackDocument
    resolveAsset?: (assetId: string) => string | undefined
    dom: Document
  },
): void {
  const dom = parent.ownerDocument
  const assignBlock = (element: HTMLElement) => {
    element.dataset.flowBlockId = block.id
    element.dataset.flowBlockType = block.type
    return element
  }

  switch (block.type) {
    case 'heading': {
      const heading = assignBlock(dom.createElement(`h${block.level}`))
      heading.id = flowRuntimeTocAnchorId(block.id)
      heading.dataset.flowTocAnchor = block.id
      appendRichText(heading, block.text, block.runs)
      parent.appendChild(heading)
      return
    }
    case 'paragraph': {
      const paragraph = assignBlock(dom.createElement('p'))
      appendRichText(paragraph, block.text, block.runs)
      parent.appendChild(paragraph)
      return
    }
    case 'quote': {
      const quote = assignBlock(dom.createElement('blockquote'))
      const paragraph = dom.createElement('p')
      appendRichText(paragraph, block.text, block.runs)
      quote.appendChild(paragraph)
      if (block.citation) {
        const cite = dom.createElement('cite')
        cite.textContent = block.citation
        quote.appendChild(cite)
      }
      parent.appendChild(quote)
      return
    }
    case 'list': {
      const list = assignBlock(dom.createElement(block.ordered ? 'ol' : 'ul'))
      for (const item of block.items) {
        const listItem = dom.createElement('li')
        listItem.dataset.flowListItemId = item.id
        appendRichText(listItem, item.text, item.runs)
        list.appendChild(listItem)
      }
      parent.appendChild(list)
      return
    }
    case 'divider':
      parent.appendChild(assignBlock(dom.createElement('hr')))
      return
    case 'media': {
      const figure = assignBlock(dom.createElement('figure'))
      figure.className = 'flow-block-media'
      const url = resolvePlaybackAssetUrl(options.playback, block.assetId, options.resolveAsset)
      if (block.mediaKind === 'image' && url) {
        const image = dom.createElement('img')
        image.src = url
        image.alt = block.altText ?? ''
        figure.appendChild(image)
      } else if (block.mediaKind === 'audio' && url) {
        const audio = dom.createElement('audio')
        audio.controls = true
        audio.src = url
        figure.appendChild(audio)
      } else if (block.mediaKind === 'video' && url) {
        const video = dom.createElement('video')
        video.controls = true
        video.src = url
        figure.appendChild(video)
      } else {
        const fallback = dom.createElement('p')
        fallback.textContent = `[媒体后备：${block.altText ?? block.caption ?? block.assetId}]`
        figure.appendChild(fallback)
      }
      if (block.caption) {
        const caption = dom.createElement('figcaption')
        caption.textContent = block.caption
        figure.appendChild(caption)
      }
      parent.appendChild(figure)
      return
    }
    case 'table': {
      const figure = assignBlock(dom.createElement('figure'))
      if (block.caption) {
        const caption = dom.createElement('figcaption')
        caption.textContent = block.caption
        figure.appendChild(caption)
      }
      const table = dom.createElement('table')
      const thead = dom.createElement('thead')
      const headerRow = dom.createElement('tr')
      for (const column of block.columns) {
        const cell = dom.createElement('th')
        cell.dataset.flowColumnId = column.id
        cell.textContent = column.header
        headerRow.appendChild(cell)
      }
      thead.appendChild(headerRow)
      table.appendChild(thead)
      const tbody = dom.createElement('tbody')
      for (const row of block.rows) {
        const tr = dom.createElement('tr')
        tr.dataset.flowRowId = row.id
        for (const column of block.columns) {
          const cell = dom.createElement('td')
          cell.textContent = flowTableCellText(row.cells[column.id])
          tr.appendChild(cell)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
      figure.appendChild(table)
      parent.appendChild(figure)
      return
    }
    case 'formula': {
      const wrap = assignBlock(dom.createElement('div'))
      wrap.dataset.flowFormulaId = block.formulaId
      const expression = dom.createElement('p')
      expression.textContent = serializeFormulaAst(block.ast)
      wrap.appendChild(expression)
      const accessible = dom.createElement('p')
      accessible.textContent = `公式说明：${block.accessibleText}`
      wrap.appendChild(accessible)
      parent.appendChild(wrap)
      return
    }
    case 'code': {
      const pre = assignBlock(dom.createElement('pre'))
      const code = dom.createElement('code')
      code.textContent = block.code
      pre.appendChild(code)
      parent.appendChild(pre)
      return
    }
    case 'callout': {
      const aside = assignBlock(dom.createElement('aside'))
      aside.dataset.flowCalloutTone = block.tone
      if (block.title) {
        const title = dom.createElement('strong')
        title.textContent = block.title
        aside.appendChild(title)
      }
      const body = dom.createElement('p')
      body.textContent = block.body
      aside.appendChild(body)
      parent.appendChild(aside)
      return
    }
    case 'section': {
      const section = assignBlock(dom.createElement('section'))
      section.id = flowRuntimeTocAnchorId(block.id)
      section.dataset.flowTocAnchor = block.id
      const title = dom.createElement('h2')
      title.textContent = block.title
      section.appendChild(title)
      for (const child of block.blocks) renderBlockDom(child, section, options)
      parent.appendChild(section)
      return
    }
    case 'component': {
      const figure = assignBlock(dom.createElement('figure'))
      const url = resolvePlaybackAssetUrl(
        options.playback,
        block.staticFallbackAssetId,
        options.resolveAsset,
      )
      if (url) {
        const image = dom.createElement('img')
        image.src = url
        image.alt = `${block.component.packageId} 后备`
        figure.appendChild(image)
      } else {
        const fallback = dom.createElement('p')
        fallback.textContent = `[组件后备：${block.component.packageId}@${block.component.version}]`
        figure.appendChild(fallback)
      }
      parent.appendChild(figure)
    }
  }
}

function appendRichText(
  element: HTMLElement,
  text: string,
  runs?: TextRun[],
): void {
  const segments = flowRichTextSegments(text, runs)
  if (segments.length === 0) {
    element.textContent = text
    return
  }
  const dom = element.ownerDocument
  for (const segment of segments) {
    const span = dom.createElement('span')
    span.textContent = segment.text
    if (segment.style.bold) span.style.fontWeight = '700'
    if (segment.style.italic) span.style.fontStyle = 'italic'
    if (segment.style.underline) span.style.textDecoration = 'underline'
    if (segment.style.strike) {
      span.style.textDecoration = span.style.textDecoration
        ? `${span.style.textDecoration} line-through`
        : 'line-through'
    }
    if (segment.style.color) span.style.color = segment.style.color
    if (segment.style.highlightColor) span.style.backgroundColor = segment.style.highlightColor
    element.appendChild(span)
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1')
}
