import type {
  SurfaceRuntimeAuthoring,
  SurfaceRuntimeAuthoringRegion,
  SurfaceRuntimeBounds,
  SurfaceRuntimeMode,
} from '../shared/surfaceRuntimeTypes'

type TargetKind = 'text' | 'asset'

interface RegisteredTarget {
  kind: TargetKind
  region: SurfaceRuntimeAuthoringRegion
  hitId: string
  disposeElement?: () => void
  boundsElement?: HTMLElement
}

export interface SurfaceRuntimeAuthoringOptions {
  root: HTMLElement
  contentKeys: () => readonly string[]
  assetKeys: () => readonly string[]
  reportHit(detail: { field: string; hitId: string; targetKind: TargetKind }): void
}

let nextHitId = 1

function finiteBounds(bounds: SurfaceRuntimeBounds): SurfaceRuntimeBounds {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    throw new Error('Surface Runtime authoring bounds must be finite')
  }
  if (bounds.width < 0 || bounds.height < 0) {
    throw new Error('Surface Runtime authoring bounds cannot be negative')
  }
  return bounds
}

function sessionHitId(kind: TargetKind, key: string): string {
  return `surface-runtime:${kind}:${nextHitId++}:${encodeURIComponent(key)}`
}

function jsonPointerEscape(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

/**
 * Bridges runtime-local targets to the stable product address used by Slide hits.
 * Hit ids identify only the current DOM instance; callers must persist `field`.
 */
export class SurfaceRuntimeAuthoringBridge implements SurfaceRuntimeAuthoring {
  readonly #targets = new Set<RegisteredTarget>()
  readonly #declarativeHitIds = new WeakMap<Element, Map<string, string>>()
  readonly #boundsLayer: HTMLElement
  readonly #onDeclarativeHit = (event: Event): void => this.#reportDeclarativeHit(event)
  #mode: SurfaceRuntimeMode
  #destroyed = false

  constructor(
    private readonly options: SurfaceRuntimeAuthoringOptions,
    mode: SurfaceRuntimeMode,
  ) {
    this.#mode = mode
    this.#boundsLayer = options.root.ownerDocument.createElement('div')
    this.#boundsLayer.className = 'surface-runtime-authoring-targets'
    this.#boundsLayer.style.position = 'absolute'
    this.#boundsLayer.style.inset = '0'
    this.#boundsLayer.style.pointerEvents = 'none'
    this.#boundsLayer.style.zIndex = '2147483647'
    options.root.addEventListener('pointerdown', this.#onDeclarativeHit)
    options.root.addEventListener('dblclick', this.#onDeclarativeHit)
  }

  registerText(region: SurfaceRuntimeAuthoringRegion): () => void {
    return this.#register('text', region)
  }

  registerAsset(region: SurfaceRuntimeAuthoringRegion): () => void {
    return this.#register('asset', region)
  }

  invalidate(): void {
    if (this.#destroyed) return
    // Runtime create/update code may replace dom.root children. The host owns
    // this transparent bridge and restores it without rebuilding the runtime.
    if (this.#boundsLayer.parentElement !== this.options.root) {
      this.options.root.appendChild(this.#boundsLayer)
    }
    for (const target of this.#targets) this.#positionBoundsTarget(target)
  }

  setMode(mode: SurfaceRuntimeMode): void {
    this.#mode = mode
    const interactive = mode === 'inspect'
    for (const target of this.#targets) {
      if (target.boundsElement) {
        target.boundsElement.style.pointerEvents = interactive ? 'auto' : 'none'
      }
    }
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.options.root.removeEventListener('pointerdown', this.#onDeclarativeHit)
    this.options.root.removeEventListener('dblclick', this.#onDeclarativeHit)
    for (const target of this.#targets) target.disposeElement?.()
    this.#targets.clear()
    this.#boundsLayer.remove()
  }

  #register(kind: TargetKind, region: SurfaceRuntimeAuthoringRegion): () => void {
    if (this.#destroyed) throw new Error('Surface Runtime authoring bridge is destroyed')
    const key = region.key.trim()
    if (!key) throw new Error('Surface Runtime authoring keys cannot be empty')
    this.#assertKnownKey(kind, key)
    const target: RegisteredTarget = {
      kind,
      region: { ...region, key },
      hitId: sessionHitId(kind, key),
    }
    if (region.element) {
      if (!this.options.root.contains(region.element)) {
        throw new Error(`Surface Runtime authoring element for ${key} is outside dom.root`)
      }
      const onHit = (event: Event): void => {
        if (this.#mode !== 'inspect') return
        event.stopPropagation()
        this.#report(kind, key, target.hitId)
      }
      region.element.addEventListener('pointerdown', onHit)
      region.element.addEventListener('dblclick', onHit)
      target.disposeElement = () => {
        region.element.removeEventListener('pointerdown', onHit)
        region.element.removeEventListener('dblclick', onHit)
      }
    } else {
      const hitRegion = this.options.root.ownerDocument.createElement('div')
      hitRegion.dataset.surfaceRuntimeTargetKind = kind
      hitRegion.dataset.surfaceRuntimeTargetKey = key
      hitRegion.ariaLabel = region.label ?? key
      hitRegion.style.position = 'absolute'
      hitRegion.style.pointerEvents = this.#mode === 'inspect' ? 'auto' : 'none'
      const onHit = (event: Event): void => {
        if (this.#mode !== 'inspect') return
        event.stopPropagation()
        this.#report(kind, key, target.hitId)
      }
      hitRegion.addEventListener('pointerdown', onHit)
      hitRegion.addEventListener('dblclick', onHit)
      this.#boundsLayer.appendChild(hitRegion)
      target.boundsElement = hitRegion
      target.disposeElement = () => {
        hitRegion.removeEventListener('pointerdown', onHit)
        hitRegion.removeEventListener('dblclick', onHit)
        hitRegion.remove()
      }
    }
    this.#targets.add(target)
    this.#positionBoundsTarget(target)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      target.disposeElement?.()
      this.#targets.delete(target)
    }
  }

  #positionBoundsTarget(target: RegisteredTarget): void {
    if (!target.boundsElement || !target.region.bounds) return
    const bounds = finiteBounds(
      typeof target.region.bounds === 'function'
        ? target.region.bounds()
        : target.region.bounds,
    )
    target.boundsElement.style.left = `${bounds.x}px`
    target.boundsElement.style.top = `${bounds.y}px`
    target.boundsElement.style.width = `${bounds.width}px`
    target.boundsElement.style.height = `${bounds.height}px`
  }

  #reportDeclarativeHit(event: Event): void {
    if (this.#mode !== 'inspect') return
    const element = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-courseware-content-key], [data-courseware-asset-key]')
      : null
    if (!element || !this.options.root.contains(element)) return
    const contentKey = element.dataset.coursewareContentKey?.trim()
    const assetKey = element.dataset.coursewareAssetKey?.trim()
    const kind: TargetKind | null = contentKey ? 'text' : assetKey ? 'asset' : null
    const key = contentKey || assetKey
    if (!kind || !key || !this.#hasKnownKey(kind, key)) return
    let elementIds = this.#declarativeHitIds.get(element)
    if (!elementIds) {
      elementIds = new Map()
      this.#declarativeHitIds.set(element, elementIds)
    }
    let hitId = elementIds.get(`${kind}:${key}`)
    if (!hitId) {
      hitId = sessionHitId(kind, key)
      elementIds.set(`${kind}:${key}`, hitId)
    }
    this.#report(kind, key, hitId)
  }

  #assertKnownKey(kind: TargetKind, key: string): void {
    if (!this.#hasKnownKey(kind, key)) {
      const namespace = kind === 'text' ? 'content.values' : 'assets'
      throw new Error(`Unknown Surface Runtime ${namespace} key ${key}`)
    }
  }

  #hasKnownKey(kind: TargetKind, key: string): boolean {
    return (kind === 'text' ? this.options.contentKeys() : this.options.assetKeys()).includes(key)
  }

  #report(kind: TargetKind, key: string, hitId: string): void {
    this.options.reportHit({
      field: kind === 'text'
        ? `runtime/content/values/${jsonPointerEscape(key)}`
        : `runtime/assets/${jsonPointerEscape(key)}/assetId`,
      hitId,
      targetKind: kind,
    })
  }
}
