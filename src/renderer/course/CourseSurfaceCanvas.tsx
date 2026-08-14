import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { SlideSurfaceHost, type SlideLayerHit, type SlideSurfaceHostOptions } from '../../player/surfaces/slide/SlideSurfaceHost'
import type { ComponentSlideItemHostFactory, RuntimeSlideItemHostFactory } from '../../player/surfaces/slide/SlideSurfaceHost'
import {
  SpatialSurfaceHost,
  type SpatialLayerHit,
} from '../../player/surfaces/spatial/SpatialSurfaceHost'
import {
  FlowScopedLayerHost,
  type FlowLayerHit,
  type FlowRenderedComponent,
} from '../../player/surfaces/flow/FlowSurfaceHost'
import { DomPlaybackFreeze } from '../../player/surfaces/domPlaybackFreeze'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import type {
  FlowBlock,
  FlowSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
  SlideSurfaceDocument,
  SpatialCameraPose,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'

export type StudioMode = 'inspect' | 'playback'

interface SlideCanvasProps {
  surface: SlideSurfaceDocument
  sceneId: string
  presentationStateId?: string
  mode: StudioMode
  selectedLayerItemId: string | null
  resolveAsset(assetId: string): string | undefined
  onLayerHit(hit: SlideLayerHit): void
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  globalLayerItems?: SlideSurfaceHostOptions['globalLayerItems']
  beforeTeacherControllerAction?: SlideSurfaceHostOptions['beforeTeacherControllerAction']
  onTeacherControllerAction?: SlideSurfaceHostOptions['onTeacherControllerAction']
  onHostReady?(host: SlideSurfaceHost | null): void
  onError(message: string): void
}

export function SlideCourseCanvas({
  surface,
  sceneId,
  presentationStateId,
  mode,
  selectedLayerItemId,
  resolveAsset,
  onLayerHit,
  componentHostFactory,
  runtimeHostFactory,
  globalLayerItems,
  beforeTeacherControllerAction,
  onTeacherControllerAction,
  onHostReady,
  onError,
}: SlideCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SlideSurfaceHost | null>(null)
  const hitHandlerRef = useRef(onLayerHit)
  const assetResolverRef = useRef(resolveAsset)
  const errorHandlerRef = useRef(onError)
  const beforeActionRef = useRef(beforeTeacherControllerAction)
  const actionHandlerRef = useRef(onTeacherControllerAction)
  const hostReadyRef = useRef(onHostReady)
  hitHandlerRef.current = onLayerHit
  assetResolverRef.current = resolveAsset
  errorHandlerRef.current = onError
  beforeActionRef.current = beforeTeacherControllerAction
  actionHandlerRef.current = onTeacherControllerAction
  hostReadyRef.current = onHostReady

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const abort = new AbortController()
    const host = new SlideSurfaceHost(surface, {
      initialSceneId: sceneId,
      initialStateId: presentationStateId,
      onLayerHit: (hit) => hitHandlerRef.current(hit),
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      beforeTeacherControllerAction: (action, item) => beforeActionRef.current?.(action, item) ?? true,
      onTeacherControllerAction: (action, item) => actionHandlerRef.current?.(action, item),
    })
    hostRef.current = host
    hostReadyRef.current?.(host)
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: abort.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset: (assetId) => assetResolverRef.current(assetId),
        reportDiagnostic: (diagnostic) => errorHandlerRef.current(diagnostic.message),
      },
    }).then(() => Promise.all([
      host.activate(),
      host.setInspectionMode(mode),
    ])).catch((error: unknown) => {
      errorHandlerRef.current(error instanceof Error ? error.message : '画布挂载失败')
    })
    return () => {
      abort.abort()
      hostRef.current = null
      hostReadyRef.current?.(null)
      void host.destroy()
    }
    // A surface identity change creates a new host. Content updates are reconciled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentHostFactory, runtimeHostFactory, surface.id])

  useEffect(() => {
    void hostRef.current?.updateDocument(surface).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '画布更新失败')
    })
  }, [surface])

  useEffect(() => {
    void hostRef.current?.setScene(sceneId).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '场景切换失败')
    })
  }, [sceneId])

  useEffect(() => {
    if (mode !== 'inspect') return
    const host = hostRef.current
    if (!host || host.stateId === presentationStateId) return
    void host.setPresentationState(presentationStateId).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '命名复核态切换失败')
    })
  }, [mode, presentationStateId])

  useEffect(() => {
    void hostRef.current?.updateGlobalLayerItems(globalLayerItems ?? []).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '全局图层更新失败')
    })
  }, [globalLayerItems])

  useEffect(() => {
    void hostRef.current?.setInspectionMode(mode).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '编辑帧切换失败')
    })
  }, [mode])

  useEffect(() => {
    const root = mountRef.current
    root?.querySelectorAll('.slide-layer-item[data-studio-selected="true"]').forEach((element) => {
      delete (element as HTMLElement).dataset.studioSelected
    })
    if (!selectedLayerItemId) return
    const wrapper = [...(root?.querySelectorAll<HTMLElement>('.slide-layer-item') ?? [])]
      .find((element) => element.dataset.layerItemId === selectedLayerItemId)
    if (wrapper) wrapper.dataset.studioSelected = 'true'
  }, [selectedLayerItemId, surface])

  return (
    <div className="course-slide-viewport" data-testid="course-slide-canvas">
      <div ref={mountRef} className="course-slide-mount" />
    </div>
  )
}

function blockSearchText(block: FlowBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote': return `${block.text} ${block.type === 'quote' ? block.citation ?? '' : ''}`
    case 'list': return block.items.map((item) => item.text).join(' ')
    case 'media': return `${block.caption ?? ''} ${block.altText ?? ''}`
    case 'table': return `${block.caption ?? ''} ${block.columns.map((column) => column.header).join(' ')} ${block.rows.flatMap((row) => Object.values(row.cells)).join(' ')}`
    case 'formula': return `${block.accessibleText} ${serializeFormulaAst(block.ast)}`
    case 'code': return `${block.language ?? ''} ${block.code}`
    case 'callout': return `${block.title ?? ''} ${block.body}`
    case 'section': return `${block.title} ${block.blocks.map(blockSearchText).join(' ')}`
    case 'component': return `${block.component.packageId} ${block.component.version}`
    case 'divider': return ''
  }
}

export function flattenFlowBlocks(blocks: readonly FlowBlock[]): FlowBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...(block.type === 'section' ? flattenFlowBlocks(block.blocks) : []),
  ])
}

export function flowBlockPrimaryText(block: FlowBlock): string | null {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote': return block.text
    case 'list': return block.items.map((item) => item.text).join('\n')
    case 'code': return block.code
    case 'callout': return block.body
    case 'section': return block.title
    case 'table': return block.caption ?? ''
    case 'formula': return block.accessibleText
    case 'media': return block.caption ?? block.altText ?? ''
    case 'component': return `互动组件：${block.component.packageId}@${block.component.version}`
    case 'divider': return null
  }
}

interface EditableBlockTextProps {
  block: FlowBlock
  disabled: boolean
  onCommit(value: string): void
}

function EditableBlockText({ block, disabled, onCommit }: EditableBlockTextProps) {
  const source = flowBlockPrimaryText(block)
  const [value, setValue] = useState(source ?? '')
  useEffect(() => setValue(source ?? ''), [block.id, source])
  if (source === null) return <hr />
  if (block.type === 'component') return <div className="course-flow-component">{source}</div>
  return (
    <textarea
      className={`course-flow-text course-flow-text--${block.type}`}
      aria-label={`编辑${block.type}块`}
      value={value}
      readOnly={disabled}
      rows={block.type === 'heading' ? 1 : block.type === 'code' ? 7 : Math.max(2, value.split('\n').length)}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!disabled && value !== source) onCommit(value)
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

interface FlowCanvasProps {
  surface: FlowSurfaceDocument
  mode: StudioMode
  selectedBlockId: string | null
  search: string
  resolveAsset(assetId: string): string | undefined
  onSelect(blockId: string): void
  onEdit(blockId: string, value: string): void
  renderComponent?(
    block: Extract<FlowBlock, { type: 'component' }>,
    dom: Document,
    mode: StudioMode,
    reportHit: (detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }) => void,
  ): FlowRenderedComponent
  selectedLayerItemId?: string | null
  globalLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  beforeTeacherControllerAction?: SlideSurfaceHostOptions['beforeTeacherControllerAction']
  onTeacherControllerAction?: SlideSurfaceHostOptions['onTeacherControllerAction']
  onLayerHit?(hit: FlowLayerHit): void
  onComponentHit?(blockId: string, detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }): void
  onError?(message: string): void
}

function FlowLiveComponent({
  surfaceId,
  block,
  mode,
  renderComponent,
  onHit,
}: {
  surfaceId: string
  block: Extract<FlowBlock, { type: 'component' }>
  mode: StudioMode
  renderComponent: NonNullable<FlowCanvasProps['renderComponent']>
  onHit(detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }): void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef<FlowRenderedComponent | null>(null)
  const hitRef = useRef(onHit)
  const contentSignature = JSON.stringify({ component: block.component, props: block.props })
  hitRef.current = onHit
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const rendered = renderComponent(block, mount.ownerDocument, mode, (detail) => hitRef.current(detail))
    renderedRef.current = rendered
    mount.replaceChildren(rendered.node)
    void rendered.setInspectionMode?.(mode)
    void rendered.activate?.()
    return () => {
      renderedRef.current = null
      void rendered.destroy?.()
      mount.replaceChildren()
    }
  }, [block.id, contentSignature, renderComponent])
  useEffect(() => {
    void renderedRef.current?.setInspectionMode?.(mode)
    if (mode === 'playback') void renderedRef.current?.resume?.()
    else void renderedRef.current?.suspend?.()
  }, [mode])
  return <div ref={mountRef} className="course-flow-component-mount" data-surface-id={surfaceId} data-flow-component-block-id={block.id} />
}

function FlowLiveMedia({
  block,
  mode,
  source,
  onCommit,
}: {
  block: Extract<FlowBlock, { type: 'media' }>
  mode: StudioMode
  source: string | undefined
  onCommit(value: string): void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const freezeRef = useRef<DomPlaybackFreeze | null>(null)
  if (!freezeRef.current) freezeRef.current = new DomPlaybackFreeze()

  useEffect(() => {
    const freeze = freezeRef.current
    if (!freeze) return
    if (mode === 'inspect') freeze.freeze(rootRef.current)
    else freeze.release()
  }, [mode])

  useEffect(() => () => freezeRef.current?.discard(), [])

  return (
    <figure ref={rootRef} className="course-flow-live-media" data-layout={block.layout}>
      {block.mediaKind === 'image'
        ? <img src={source} alt={block.altText ?? ''} data-asset-id={block.assetId} />
        : block.mediaKind === 'video'
          ? <video src={source} controls aria-label={block.altText ?? block.caption ?? 'video'} data-asset-id={block.assetId} />
          : <audio src={source} controls aria-label={block.altText ?? block.caption ?? 'audio'} data-asset-id={block.assetId} />}
      <figcaption>
        <EditableBlockText block={block} disabled={mode === 'playback'} onCommit={onCommit} />
      </figcaption>
    </figure>
  )
}

export function FlowCourseCanvas({
  surface,
  mode,
  selectedBlockId,
  search,
  resolveAsset,
  onSelect,
  onEdit,
  renderComponent,
  selectedLayerItemId = null,
  globalLayerItems = [],
  locationId,
  componentHostFactory,
  runtimeHostFactory,
  beforeTeacherControllerAction,
  onTeacherControllerAction,
  onLayerHit,
  onComponentHit,
  onError,
}: FlowCanvasProps) {
  const overlayMountRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<FlowScopedLayerHost | null>(null)
  const layerHitRef = useRef(onLayerHit)
  const errorRef = useRef(onError)
  const beforeActionRef = useRef(beforeTeacherControllerAction)
  const actionRef = useRef(onTeacherControllerAction)
  layerHitRef.current = onLayerHit
  errorRef.current = onError
  beforeActionRef.current = beforeTeacherControllerAction
  actionRef.current = onTeacherControllerAction
  useEffect(() => {
    const mount = overlayMountRef.current
    if (!mount) return
    const controller = new AbortController()
    const host = new FlowScopedLayerHost(surface, {
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      locationId,
      inspectionMode: mode,
      beforeTeacherControllerAction: (action, item) => beforeActionRef.current?.(action, item) ?? true,
      onTeacherControllerAction: (action, item) => actionRef.current?.(action, item),
      onLayerHit: (hit) => layerHitRef.current?.(hit),
    })
    overlayHostRef.current = host
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: controller.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset,
        reportDiagnostic: (diagnostic) => errorRef.current?.(diagnostic.message),
      },
    }).then(async () => {
      await host.activate()
      if (!selectedLayerItemId) return
      const wrapper = [...mount.querySelectorAll<HTMLElement>('.slide-layer-item')]
        .find((element) => element.dataset.layerItemId === selectedLayerItemId)
      if (wrapper) wrapper.dataset.studioSelected = 'true'
    }).catch((cause: unknown) => {
      errorRef.current?.(cause instanceof Error ? cause.message : 'Flow 图层挂载失败')
    })
    return () => {
      controller.abort()
      overlayHostRef.current = null
      void host.destroy()
    }
    // Stable backend factories and surface identity own the live instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentHostFactory, runtimeHostFactory, surface.id])
  useEffect(() => {
    void overlayHostRef.current?.updateDocument(surface).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 图层更新失败')
    })
  }, [onError, surface])
  useEffect(() => {
    void overlayHostRef.current?.updateGlobalLayerItems(globalLayerItems).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '全局图层更新失败')
    })
  }, [globalLayerItems, onError])
  useEffect(() => {
    if (!locationId) return
    void overlayHostRef.current?.setLocationId(locationId).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 位置可见性更新失败')
    })
  }, [locationId, onError])
  useEffect(() => {
    void overlayHostRef.current?.setInspectionMode(mode).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 编辑帧切换失败')
    })
  }, [mode, onError])
  useEffect(() => {
    const root = overlayMountRef.current
    root?.querySelectorAll('.slide-layer-item[data-studio-selected="true"]').forEach((element) => {
      delete (element as HTMLElement).dataset.studioSelected
    })
    if (!selectedLayerItemId) return
    const wrapper = [...(root?.querySelectorAll<HTMLElement>('.slide-layer-item') ?? [])]
      .find((element) => element.dataset.layerItemId === selectedLayerItemId)
    if (wrapper) wrapper.dataset.studioSelected = 'true'
  }, [globalLayerItems, selectedLayerItemId, surface])
  const query = search.trim().toLocaleLowerCase('zh-CN')
  const blocks = query
    ? flattenFlowBlocks(surface.blocks).filter((block) => blockSearchText(block).toLocaleLowerCase('zh-CN').includes(query))
    : surface.blocks
  const renderBlock = (block: FlowBlock, depth = 0): ReactNode => (
    <section
      key={block.id}
      className={`course-flow-card${selectedBlockId === block.id ? ' is-selected' : ''}${depth > 0 ? ' is-nested' : ''}`}
      data-flow-block-id={block.id}
      style={depth > 0 ? { marginLeft: Math.min(depth, 5) * 24 } : undefined}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(block.id) }}
    >
      <span className="course-flow-kind">{block.type}</span>
      {block.type === 'media'
        ? <FlowLiveMedia
            block={block}
            mode={mode}
            source={resolveAsset(block.assetId)}
            onCommit={(value) => onEdit(block.id, value)}
          />
        : block.type === 'component' && renderComponent
        ? <FlowLiveComponent
            surfaceId={surface.id}
            block={block}
            mode={mode}
            renderComponent={renderComponent}
            onHit={(detail) => onComponentHit?.(block.id, detail)}
          />
        : <EditableBlockText
            block={block}
            disabled={mode === 'playback'}
            onCommit={(value) => onEdit(block.id, value)}
          />}
      {block.type === 'section' && (
        <div className="course-flow-section-children" data-section-children={block.id}>
          {block.blocks.length === 0
            ? <p className="course-empty">该分节还没有子块。</p>
            : block.blocks.map((child) => renderBlock(child, depth + 1))}
        </div>
      )}
    </section>
  )
  return (
    <div className="course-flow-scroll" data-testid="course-flow-canvas">
      <div className="course-flow-stage">
        <article className="course-flow-document" style={{ maxWidth: surface.layout.wideContentWidth }}>
          {blocks.length === 0 && <p className="course-empty">没有匹配的内容块。</p>}
          {blocks.map((block) => renderBlock(block))}
        </article>
        <div ref={overlayMountRef} className="course-flow-overlay-mount" />
      </div>
    </div>
  )
}

interface SpatialCanvasProps {
  surface: SpatialSurfaceDocument
  mode: StudioMode
  camera: SpatialCameraPose
  selectedLayerItemId: string | null
  resolveAsset(assetId: string): string | undefined
  onCameraChange(camera: SpatialCameraPose): void
  onSelect(layerItemId: string | null): void
  onLayerHit?(hit: SpatialLayerHit): void
  onMove(
    layerItemId: string,
    dx: number,
    dy: number,
    source?: SpatialLayerHit['source'],
  ): void
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  globalLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  onError?(message: string): void
}

type SpatialGesture =
  | { kind: 'pan'; pointerId: number; x: number; y: number; camera: SpatialCameraPose }
  | {
      kind: 'item'
      pointerId: number
      x: number
      y: number
      layerItemId: string
      source: SpatialLayerHit['source']
    }

export function SpatialCourseCanvas({
  surface,
  mode,
  camera,
  selectedLayerItemId,
  resolveAsset,
  onCameraChange,
  onSelect,
  onLayerHit,
  onMove,
  componentHostFactory,
  runtimeHostFactory,
  globalLayerItems,
  locationId,
  onError,
}: SpatialCanvasProps) {
  const viewport = { width: 1000, height: 640 }
  const gestureRef = useRef<SpatialGesture | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SpatialSurfaceHost | null>(null)
  const cameraRef = useRef(camera)
  const cameraChangeRef = useRef(onCameraChange)
  const selectRef = useRef(onSelect)
  const layerHitRef = useRef(onLayerHit)
  const assetResolverRef = useRef(resolveAsset)
  const errorRef = useRef(onError)
  cameraRef.current = camera
  cameraChangeRef.current = onCameraChange
  selectRef.current = onSelect
  layerHitRef.current = onLayerHit
  assetResolverRef.current = resolveAsset
  errorRef.current = onError
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const previewSurface = useMemo(() => {
    if (!selectedLayerItemId || (previewOffset.x === 0 && previewOffset.y === 0)) return surface
    const copy = structuredClone(surface)
    const source = gestureRef.current?.kind === 'item' ? gestureRef.current.source : 'world'
    const item = source === 'world'
      ? copy.world.layerItems.find((candidate) => candidate.layerItemId === selectedLayerItemId)
      : source === 'surface'
        ? copy.surfaceLayerItems.find((candidate) => candidate.item.layerItemId === selectedLayerItemId)?.item
        : undefined
    if (item) {
      item.frame.x += previewOffset.x
      item.frame.y += previewOffset.y
    }
    return copy
  }, [previewOffset.x, previewOffset.y, selectedLayerItemId, surface])
  const previewGlobalLayerItems = useMemo(() => {
    const copy = structuredClone(globalLayerItems ?? [])
    if (
      !selectedLayerItemId ||
      (previewOffset.x === 0 && previewOffset.y === 0) ||
      gestureRef.current?.kind !== 'item' ||
      gestureRef.current.source !== 'global'
    ) return copy
    const item = copy.find((candidate) => candidate.item.layerItemId === selectedLayerItemId)?.item
    if (item) {
      item.frame.x += previewOffset.x
      item.frame.y += previewOffset.y
    }
    return copy
  }, [globalLayerItems, previewOffset.x, previewOffset.y, selectedLayerItemId])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const abort = new AbortController()
    const host = new SpatialSurfaceHost(surface, viewport, {
      showControls: false,
      showMinimap: false,
      interactiveCamera: false,
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      initialLocationId: locationId,
      onLayerHit: (hit) => {
        if (layerHitRef.current) layerHitRef.current(hit)
        else selectRef.current(hit.layerItemId)
      },
    })
    hostRef.current = host
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: abort.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset: (assetId) => assetResolverRef.current(assetId),
        reportDiagnostic: (diagnostic) => errorRef.current?.(diagnostic.message),
      },
    }).then(async () => {
      await host.setCamera({ ...cameraRef.current, viewportWidth: viewport.width, viewportHeight: viewport.height })
      await host.setInspectionMode(mode)
      await host.activate()
    }).catch((cause: unknown) => {
      errorRef.current?.(cause instanceof Error ? cause.message : '空间画布挂载失败')
    })
    return () => {
      abort.abort()
      hostRef.current = null
      void host.destroy()
    }
    // Stable factories and a surface identity own one live host. Document,
    // camera and mode changes are reconciled below without remounting backends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentHostFactory, runtimeHostFactory, surface.id])

  useEffect(() => {
    void hostRef.current?.updateDocument(previewSurface).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间画布更新失败')
    })
  }, [onError, previewSurface])

  useEffect(() => {
    void hostRef.current?.setCamera({
      ...camera,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    }).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间镜头更新失败')
    })
  }, [camera, onError])

  useEffect(() => {
    void hostRef.current?.setInspectionMode(mode).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间编辑帧切换失败')
    })
  }, [mode, onError])

  useEffect(() => {
    void hostRef.current?.updateGlobalLayerItems(previewGlobalLayerItems).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间全局图层更新失败')
    })
  }, [onError, previewGlobalLayerItems])

  useEffect(() => {
    if (!locationId) return
    void hostRef.current?.setLocationId(locationId).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间位置更新失败')
    })
  }, [locationId, onError])

  useEffect(() => {
    const root = mountRef.current
    root?.querySelectorAll('[data-spatial-layer-record][data-studio-selected="true"]').forEach((element) => {
      delete (element as SVGElement).dataset.studioSelected
    })
    if (!selectedLayerItemId) return
    const wrapper = [...(root?.querySelectorAll<SVGGElement>('[data-spatial-layer-record]') ?? [])]
      .find((element) => element.dataset.layerItemId === selectedLayerItemId)
    if (wrapper) wrapper.dataset.studioSelected = 'true'
  }, [previewSurface, selectedLayerItemId])

  const worldDelta = (element: HTMLElement, clientDx: number, clientDy: number) => {
    const bounds = element.getBoundingClientRect()
    const scaleX = viewport.width / Math.max(1, bounds.width)
    const scaleY = viewport.height / Math.max(1, bounds.height)
    return { x: clientDx * scaleX / camera.zoom, y: clientDy * scaleY / camera.zoom }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.target as Element
    const layer = element.closest<SVGElement>('[data-spatial-layer-record]')
    if (layer) {
      const layerItemId = layer.dataset.layerItemId!
      if (mode === 'inspect') {
        // The native wrapper does not expose a finer field. Dynamic target
        // overlays already reported their full hit (field + hitId) through the
        // host and must not be overwritten by this bubbling handler.
        if (!layerHitRef.current && !element.closest('[data-dynamic-hit-id]')) onSelect(layerItemId)
        event.currentTarget.setPointerCapture(event.pointerId)
        gestureRef.current = {
          kind: 'item',
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          layerItemId,
          source: layer.dataset.layerSource === 'global'
            ? 'global'
            : layer.dataset.layerSource === 'surface'
              ? 'surface'
              : 'world',
        }
      }
    } else {
      onSelect(null)
      event.currentTarget.setPointerCapture(event.pointerId)
      gestureRef.current = { kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera }
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const delta = worldDelta(event.currentTarget, event.clientX - gesture.x, event.clientY - gesture.y)
    if (gesture.kind === 'pan') {
      onCameraChange({ ...gesture.camera, x: gesture.camera.x - delta.x, y: gesture.camera.y - delta.y })
    } else {
      setPreviewOffset(delta)
    }
  }

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.kind === 'item' && (previewOffset.x !== 0 || previewOffset.y !== 0)) {
      onMove(gesture.layerItemId, previewOffset.x, previewOffset.y, gesture.source)
    }
    gestureRef.current = null
    setPreviewOffset({ x: 0, y: 0 })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = cameraRef.current
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      cameraChangeRef.current({
        ...current,
        zoom: Math.min(8, Math.max(0.1, current.zoom * factor)),
      })
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={viewportRef}
      className={`course-spatial-viewport${mode === 'inspect' ? ' is-inspecting' : ''}`}
      data-testid="course-spatial-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
    >
      <div ref={mountRef} className="course-spatial-mount" />
    </div>
  )
}

export function selectedLayer(
  surface: SlideSurfaceDocument | FlowSurfaceDocument | SpatialSurfaceDocument,
  sceneId: string | undefined,
  layerItemId: string | null,
  source: 'scene' | 'world' | 'surface' | 'global' = surface.type === 'slide' ? 'scene' : 'world',
  globalLayerItems: readonly { item: LayerItem }[] = [],
): LayerItem | null {
  if (!layerItemId) return null
  const items = source === 'global'
    ? globalLayerItems.map((entry) => entry.item)
    : source === 'surface'
      ? surface.surfaceLayerItems.map((entry) => entry.item)
      : source === 'world' && surface.type === 'spatial-2d'
        ? surface.world.layerItems
      : surface.type === 'slide'
        ? surface.scenes.find((scene) => scene.id === sceneId)?.layerItems ?? []
        : surface.type === 'spatial-2d'
          ? surface.world.layerItems
          : []
  return items.find((item) => item.layerItemId === layerItemId) ?? null
}
